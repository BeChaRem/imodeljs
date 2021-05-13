/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { BeDuration, Dictionary, Id64Array, Id64String, SortedArray, StopWatch } from "@bentley/bentleyjs-core";
import { DisplayStyleProps, FeatureAppearance, RenderMode, ViewStateProps } from "@bentley/imodeljs-common";
import {
  DisplayStyle3dState, DisplayStyleState, EntityState, FeatureSymbology, IModelApp, IModelConnection, SnapshotConnection, ScreenViewport, ViewState,
} from "@bentley/imodeljs-frontend";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";
import {
  ElementOverrideProps, TestConfig, TestConfigProps, TestConfigStack, ViewStateSpec, ViewStateSpecProps,
} from "./TestConfig";
import { DisplayPerfTestApp } from "./DisplayPerformanceTestApp";

export interface TestSetProps extends TestConfigProps {
  tests: TestConfigProps[];
}

export interface TestSetsProps extends TestConfigProps {
  signIn?: boolean;
  minimize?: boolean;
  testSet: TestSetProps[];
}

interface TestContext {
  readonly iModel: IModelConnection;
  readonly externalSavedViews: ViewStateSpec[];
}

interface TestViewState {
  readonly view: ViewState;
  readonly elementOverrides?: ElementOverrideProps[];
  readonly selectedElements?: Id64String | Id64Array;
}

interface TestResult {
  selectedTileIds: string;
  tileLoadingTime: number;
}

class OverrideProvider {
  private readonly _elementOvrs = new Map<Id64String, FeatureAppearance>();
  private readonly _defaultOvrs?: FeatureAppearance;

  private constructor(ovrs: ElementOverrideProps[]) {
    for (const ovr of ovrs) {
      const app = FeatureAppearance.fromJSON(ovr.fsa);
      if (ovr.id === "-default-")
        this._defaultOvrs = app;
      else
        this._elementOvrs.set(ovr.id, app);
    }
  }

  public static override(vp: ScreenViewport, ovrs: ElementOverrideProps[]): void {
    const provider = new OverrideProvider(ovrs);
    vp.addFeatureOverrideProvider(provider);
  }

  public addFeatureOverrides(ovrs: FeatureSymbology.Overrides): void {
    if (this._defaultOvrs)
      ovrs.setDefaultOverrides(this._defaultOvrs);

    for (const [key, value] of this._elementOvrs)
      ovrs.overrideElement(key, value);
  }
}

export class TestRunner {
  private readonly _config: TestConfigStack;
  private readonly _minimizeOutput: boolean;
  private readonly _testSets: TestSetProps[];
  private readonly _logFileName: string;
  private readonly _testNamesImages = new Map<string, number>();
  private readonly _testNamesTimings = new Map<string, number>();

  private get curConfig(): TestConfig {
    return this._config.top;
  }

  private constructor(props: TestSetsProps) {
    this._config = new TestConfigStack(new TestConfig(props));
    this._testSets = props.testSet;
    this._minimizeOutput = true === props.minimize;
    this._logFileName = "_DispPerfTestAppViewLog.txt";
  }

  public static async create(props: TestSetsProps): Promise<TestRunner> {
    // ###TODO: Sign-in, if hub integration ever gets fixed.
    return new TestRunner(props);
  }

  public async run(): Promise<void> {
    const msg = `View Log,  Model Base Location: ${this.curConfig.iModelLocation!}\n  format: Time_started  ModelName  [ViewName]`;
    await this.logToConsole(msg);
    await this.logToFile(msg);

    // Run all the tests
    for (const set of this._testSets)
      await this.runTestSet(set);

    // Update UI to signal we're finished.
    const topdiv = document.getElementById("topdiv")!;
    topdiv.style.display = "block";
    topdiv.innerText = "Tests Completed.";
    document.getElementById("imodel-viewport")!.style.display = "hidden";

    // Write WebGL compatibility info to CSV.
    await this.finish();

    return IModelApp.shutdown();
  }

  private async runTestSet(set: TestSetProps): Promise<void> {
    let needRestart = this._config.push(set);

    // Perform all the tests for this iModel. If the iModel name contains an asterisk,
    // treat it as a wildcard and run tests for each iModel that matches the given wildcard.
    for (const testProps of set.tests) {
      if (this._config.push(testProps))
        needRestart = true;

      // Ensure IModelApp is initialized with options required by this test.
      if (IModelApp.initialized && needRestart)
        await IModelApp.shutdown();

      if (!IModelApp.initialized) {
        await DisplayPerfTestApp.startup({
          renderSys: this.curConfig.renderOptions,
          tileAdmin: this.curConfig.tileProps,
        });
      }

      // Run test against all iModels matching the test config.
      const iModelNames = await this.getIModelNames();
      const originalViewName = this.curConfig.viewName;
      for (const iModelName of iModelNames) {
        this.curConfig.iModelName = iModelName;
        this.curConfig.viewName = originalViewName;

        const context = await this.openIModel();
        if (context) {
          await this.runTests(context);
          await context.iModel.close();
        }
      }

      this._config.pop();
    }

    this._config.pop();
  }

  private async runTests(context: TestContext): Promise<void> {
    const viewNames = await this.getViewNames(context);
    for (const viewName of viewNames) {
      this.curConfig.viewName = viewName;

      await this.logTest();

      const result = await this.runTest(context);
      await this.logToFile(result.selectedTileIds);
    }
  }

  private async runTest(context: TestContext): Promise<TestResult> {
  // Reset the title bar to include the current model and view name
    const testConfig = this.curConfig;
    document.title = "Display Performance Test App:  ".concat(testConfig.iModelName ?? "", "  [", testConfig.viewName ?? "", "]");

    if (testConfig.testType === "image" || testConfig.testType === "both") {
    }
  }

  private async setupTest(context: TestContext) { // ###TODO return type
    // Workaround for shifting map geometry when location needs to be asynchronously initialized.
    const imodel = context.iModel;
    await imodel.backgroundMapLocation.initialize(imodel);

    // Open the view.
    const view = await this.loadView(context);
    if (!view)
      return undefined;

    const viewport = this.openViewport(view.view); // ###TODO make sure this gets disposed.

    // Apply emphasis and hilite settings.
    const config = this.curConfig;
    if (config.hilite)
      viewport.hilite = config.hilite;

    if (config.emphasis)
      viewport.emphasisSettings = config.emphasis;

    // Apply display style.
    if (config.displayStyle) {
      const styleProps = await imodel.elements.queryProps({ from: DisplayStyleState.classFullName, where: `CodeValue='${config.displayStyle}'` });
      if (styleProps.length >= 1) {
        const style = new DisplayStyle3dState(styleProps[0] as DisplayStyleProps, imodel);
        await style.load();
        viewport.view.setDisplayStyle(style);
      }
    }

    // Apply the view flags.
    if (config.viewFlags) {
      const vf = viewport.viewFlags as { [key: string]: any };
      const configVf = config.viewFlags as { [key: string]: any };
      for (const key of Object.keys(vf)) {
        const flag = configVf[key];
        if (undefined !== flag) {
          if (key === "renderMode" && typeof flag === "string") {
            switch (flag.toLowerCase()) {
              case "solidfill": vf.renderMode = RenderMode.SolidFill; break;
              case "hiddenline": vf.renderMode = RenderMode.HiddenLine; break;
              case "wireframe": vf.renderMode = RenderMode.Wireframe; break;
              case "smoothshade": vf.renderMode = RenderMode.SmoothShade; break;
            }
          } else {
            vf[key] = flag;
          }
        } else {
          configVf[key] = vf[key];
        }
      }
    }

    if (config.backgroundMap)
      viewport.changeBackgroundMapProps(viewport.displayStyle.settings.backgroundMap.clone(config.backgroundMap));

    // Apply symbology overrides
    if (view.elementOverrides)
      OverrideProvider.override(viewport, view.elementOverrides);

    // Ensure all tiles required for the view are loaded.
    const result = await this.waitForTilesToLoad(viewport);

    // Set selected elements after all tiles have loaded.
    if (view.selectedElements) {
      imodel.selectionSet.add(view.selectedElements);
      viewport.markSelectionSetDirty();
      viewport.renderFrame();
    }

    return result;
  }

  private async waitForTilesToLoad(viewport: ScreenViewport): Promise<TestResult> {
    const timer = new StopWatch(undefined, true);
    let haveNewTiles = true;
    while (haveNewTiles) {
      viewport.requestRedraw();
      viewport.invalidateScene();
      viewport.renderFrame();

      // The scene is ready when (1) all required TileTrees have been created and (2) all required tiles have finished loading.
      const context = viewport.createSceneContext();
      viewport.view.createScene(context);
      context.requestMissingTiles();

      haveNewTiles = !viewport.areAllTileTreesLoaded || context.hasMissingTiles || 0 < context.missingTiles.size;
      if (!haveNewTiles) {
        // ViewAttachments and 3d section drawing attachments render to separate off-screen viewports - check those too.
        for (const vp of viewport.view.secondaryViewports) {
          if (vp.numRequestedTiles > 0) {
            haveNewTiles = true;
            break;
          }

          const tiles = IModelApp.tileAdmin.getTilesForViewport(vp);
          if (tiles && tiles.external.requested > 0) {
            haveNewTiles = true;
            break;
          }
        }
      }

      // NB: The viewport is NOT added to the ViewManager's render loop, therefore we must manually pump the tile request scheduler.
      if (haveNewTiles)
        IModelApp.tileAdmin.process();

      await BeDuration.wait(100);
    }

    viewport.renderFrame();
    timer.stop();

    return {
      tileLoadingTime: timer.current.milliseconds,
      selectedTileIds: formatSelectedTileIds(viewport),
    };
  }

  private openViewport(view: ViewState): ScreenViewport {
    // Ensure the exact same number of pixels regardless of device pixel ratio.
    const div = document.getElementById("imodel-viewport") as HTMLDivElement;
    const ratio = false === IModelApp.renderSystem.options.dpiAwareViewports ? 1 : (window.devicePixelRatio || 1);
    const width = `${String(this.curConfig.view.width / ratio)}px`;
    const height = `${String(this.curConfig.view.height / ratio)}px`;

    div.style.width = width;
    div.style.height = height;

    const vp = ScreenViewport.create(div, view);
    vp.rendersToScreen = true;

    vp.canvas.style.width = width;
    vp.canvas.style.height = height;

    return vp;
  }

  private async loadView(context: TestContext): Promise<TestViewState | undefined> {
    const config = this.curConfig;

    let spec = config.viewStateSpec;
    if (!spec) {
      // A external and persistent view may exist with the same name. Check for external first.
      // (Note: the old code used to check for persistent first.)
      const name = config.extViewName ?? config.viewName;
      spec = context.externalSavedViews.find((x) => x.name === config.extViewName);
      if (!spec)
        return undefined;
    }

    if (spec) {
      const className = spec.viewProps.viewDefinitionProps.classFullName;
      const ctor = await context.iModel.findClassFor<typeof EntityState>(className, undefined) as typeof ViewState | undefined;
      const view = ctor?.createFromProps(spec.viewProps, context.iModel);
      if (!view)
        return undefined;

      await view.load();
      return {
        view,
        elementOverrides: spec.elementOverrides,
        selectedElements: spec.selectedElements,
      };
    }

    const ids = await context.iModel.elements.queryIds({ from: ViewState.classFullName, where: `CodeValue=$'{config.viewName}'` });
    for (const id of ids)
      return { view: await context.iModel.views.load(id) };

    return undefined;
  }

  private async loadViewString(viewString: string, imodel: IModelConnection): Promise<ViewState | undefined> {
    const json = JSON.parse(viewString);
    const className = json.viewDefinitionProps.classFullName;
    const ctor = await imodel.findClassFor<typeof EntityState>(className, undefined) as typeof ViewState | undefined;
    return ctor ? ctor.createFromProps(json, imodel) : undefined;
  }

  // private updateTestNames(prefix?: string, isImage = false): void {
  //   const testNames = isImage ? this._testNamesImages : this._testNamesTimings;
  //   const testName = this.getTestName(prefix, false, true);
  //   const testNameDupes = testNames.get(testName) ?? 0;
  //   testNames.set(testName, testNameDupes + 1);
  // }

  private async logTest(): Promise<void> {
    const testConfig = this.curConfig;
    const today = new Date();
    const month = (`0${(today.getMonth() + 1)}`).slice(-2);
    const day = (`0${today.getDate()}`).slice(-2);
    const year = today.getFullYear();
    const hours = (`0${today.getHours()}`).slice(-2);
    const minutes = (`0${today.getMinutes()}`).slice(-2);
    const seconds = (`0${today.getSeconds()}`).slice(-2);
    const outStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}  ${testConfig.iModelName}  [${testConfig.viewName}]`;

    await this.logToConsole(outStr);
    return this.logToFile(outStr);
  }

  private async openIModel(): Promise<TestContext | undefined> {
    const filepath = path.join(this.curConfig.iModelLocation, this.curConfig.iModelName);
    let iModel;
    try {
      iModel = await SnapshotConnection.openFile(path.join(filepath));
    } catch (err) {
      alert(`openSnapshot failed: ${err.toString()}`);
      return undefined;
    }

    const esv = await DisplayPerfRpcInterface.getClient().readExternalSavedViews(filepath);
    let externalSavedViews: ViewStateSpec[] = [];
    if (esv) {
      const json = JSON.parse(esv) as ViewStateSpecProps[];
      externalSavedViews = json.map((x) => {
        return {
          name: x._name,
          view: JSON.parse(x._viewString) as ViewStateProps,
          elementOverrides: x._overrideElements ? JSON.parse(x._overrideElements) as ElementOverrideProps[] : undefined,
          selectedElements: x._selectedElements ? JSON.parse(x._selectedElements) as Id64String | Id64Array : undefined,
        };
      });
    }

    return { iModel, externalSavedViews };
  }

  private async getIModelNames(): Promise<string[]> {
    const config = this.curConfig;
    if (!config.iModelName.includes("*"))
      return [config.iModelName];

    const json = await DisplayPerfRpcInterface.getClient().getMatchingFiles(config.iModelLocation, config.iModelName);
    const files = JSON.parse(json);
    const iModels = [];
    for (const file of files) {
      if (file.endsWith(".bim") || file.endsWith(".ibim")) {
        const split = file.split("\\"); // ###TODO Use the path API to support non-Windows platforms.
        const iModel = split[split.length - 1];
        if (iModel)
          iModels.push(iModel);
      }
    }

    return iModels;
  }

  private async getViewNames(context: TestContext): Promise<string[]> {
    if (!this.curConfig.viewName.includes("*"))
      return [this.curConfig.viewName];

    let viewNames: string[] = [];
    if (this.curConfig.savedViewType !== "external") {
      const specs = await context.iModel.views.getViewList({ wantPrivate: true });
      viewNames = specs.map((spec) => spec.name);
    }

    if (this.curConfig.savedViewType !== "internal" && this.curConfig.savedViewType !== "local")
      viewNames = viewNames.concat(context.externalSavedViews.map((x) => x.name));

    return viewNames.filter((view) => matchRule(view, this.curConfig.viewName ?? "*")).sort();
  }

  private async finish(): Promise<void> {
    let renderData = "\"End of Tests-----------\r\n";
    const renderComp = IModelApp.queryRenderCompatibility();
    if (renderComp.userAgent) {
      renderData += `Browser: ${getBrowserName(renderComp.userAgent)}\r\n`;
      renderData += `User Agent: ${renderComp.userAgent}\r\n`;
    }
    if (renderComp.unmaskedRenderer)
      renderData += `Unmasked Renderer: ${renderComp.unmaskedRenderer}\r\n`;

    if (renderComp.unmaskedVendor)
      renderData += `Unmasked Vendor: ${renderComp.unmaskedVendor}\r\n`;

    if (renderComp.missingRequiredFeatures)
      renderData += `Missing Required Features: ${renderComp.missingRequiredFeatures}\r\n`;

    if (renderComp.missingOptionalFeatures)
      renderData += `Missing Optional Features: ${renderComp.missingOptionalFeatures}"\r\n`;

    await DisplayPerfRpcInterface.getClient().finishCsv(renderData, this.curConfig.outputPath, this.curConfig.outputName, this.curConfig.csvFormat);
    return DisplayPerfRpcInterface.getClient().finishTest();
  }

  private async logToFile(message: string): Promise<void> {
    return DisplayPerfRpcInterface.getClient().writeExternalFile(this.curConfig.outputPath, this._logFileName, true, message);
  }

  private async logToConsole(message: string): Promise<void> {
    return DisplayPerfRpcInterface.getClient().consoleLog(message);
  }

  // private getTestName(prefix?: string, isImage = false, ignoreDupes = false): string {
  //   let testName = prefix ?? "";
  //   const configs = this.curConfig;

  //   testName += configs.iModelName.replace(/\.[^/.]+$/, "") : "";
  //   testName += `_${configs.viewName}` : "";
  //   testName += configs.displayStyle ? `_${configs.displayStyle.trim()}` : "";
  //   testName += getRenderMode() !== "" ? `_${getRenderMode()}` : "";
  //   testName += getViewFlagsString() !== "" ? `_${getViewFlagsString()}` : "";
  //   testName += getRenderOpts(opts.render) !== "" ? `_${getRenderOpts(opts.render)}` : "";
  //   testName += getTileProps(opts.tile) !== "" ? `_${getTileProps(opts.tile)}` : "";
  //   testName += getBackgroundMapProps() !== "" ? `_${getBackgroundMapProps()}` : "";
  //   testName += getOtherProps() !== "" ? `_${getOtherProps()}` : "";
  //   testName = removeOptsFromString(testName, configs.filenameOptsToIgnore);
  //   if (!ignoreDupes) {
  //     let testNum = isImage ? this._testNamesImages.get(testName) : this._testNamesTimings.get(testName);
  //     if (testNum === undefined)
  //       testNum = 0;

  //     testName += (testNum > 1) ? (`---${testNum}`) : "";
  //   }

  //   return testName;
  // }
}

function getBrowserName(userAgent: string): string {
  const lowUserAgent = userAgent.toLowerCase();
  if (lowUserAgent.includes("electron"))
    return "Electron";
  if (lowUserAgent.includes("firefox"))
    return "FireFox";
  if (lowUserAgent.includes("edge"))
    return "Edge";
  if (lowUserAgent.includes("chrome") && !userAgent.includes("chromium"))
    return "Chrome";
  if (lowUserAgent.includes("safari") && !userAgent.includes("chrome") && !userAgent.includes("chromium"))
    return "Safari";
  return "Unknown";
}

/** See https://stackoverflow.com/questions/26246601/wildcard-string-comparison-in-javascript
 * Compare strToTest with a given rule containing a wildcard, and will return true if strToTest matches the given wildcard
 * Make sure it is case-insensitive
 */
function matchRule(strToTest: string, rule: string) {
  strToTest = strToTest.toLowerCase();
  rule = rule.toLowerCase();
  const escapeRegex = (str: string) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`^${rule.split("*").map(escapeRegex).join(".*")}$`).test(strToTest);
}

/* A formatted string containing the Ids of all the tiles that were selected for display by the last call to waitForTilesToLoad(), of the format:
 *  Selected Tiles:
 *    TreeId1: tileId1,tileId2,...
 *    TreeId2: tileId1,tileId2,...
 *    ...
 * Sorted by tree Id and then by tile Id so that the output is consistent from run to run unless the set of selected tiles changed between runs.
 */
function formatSelectedTileIds(vp: ScreenViewport): string {
  let formattedSelectedTileIds = "Selected tiles:\n";

  const dict = new Dictionary<string, SortedArray<string>>((lhs, rhs) => lhs.localeCompare(rhs));
  for (const viewport of [vp, ...vp.view.secondaryViewports]) {
    const selected = IModelApp.tileAdmin.getTilesForViewport(viewport)?.selected;
    if (!selected)
      continue;

    for (const tile of selected) {
      const treeId = tile.tree.id;
      let tileIds = dict.get(treeId);
      if (!tileIds)
        dict.set(treeId, tileIds = new SortedArray<string>((lhs, rhs) => lhs.localeCompare(rhs)));

      tileIds.insert(tile.contentId);
    }
  }

  for (const kvp of dict) {
    const contentIds = kvp.value.extractArray().join(",");
    const line = `  ${kvp.key}: ${contentIds}`;
    formattedSelectedTileIds = `${formattedSelectedTileIds}${line}\n`;
  }

  return formattedSelectedTileIds;
}

async function main(): Promise<void> {
  const configStr = await DisplayPerfRpcInterface.getClient().getDefaultConfigs();
  const props = JSON.parse(configStr) as TestSetsProps;
  const runner = await TestRunner.create(props);
  return runner.run();
}
