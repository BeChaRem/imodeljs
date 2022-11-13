## API Report File for "@itwin/map-layers-formats"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { ArcGISImageryProvider } from '@itwin/core-frontend';
import { Cartographic } from '@itwin/core-common';
import { ImageMapLayerSettings } from '@itwin/core-common';
import { ImageryMapTileTree } from '@itwin/core-frontend';
import { ImageSource } from '@itwin/core-common';
import { MapLayerFeatureInfo } from '@itwin/core-frontend';
import { QuadId } from '@itwin/core-frontend';
import { Transform } from '@itwin/core-geometry';

// @internal
export class ArcGisFeatureProvider extends ArcGISImageryProvider {
    constructor(settings: ImageMapLayerSettings);
    // (undocumented)
    protected computeTileWorld2CanvasTransform(row: number, column: number, zoomLevel: number): Transform | undefined;
    // (undocumented)
    constructFeatureUrl(row: number, column: number, zoomLevel: number, format: ArcGisFeatureFormat, geomOverride?: ArcGisGeometry, outFields?: string, tolerance?: number, returnGeometry?: boolean): ArcGisFeatureUrl | undefined;
    // (undocumented)
    constructUrl(_row: number, _column: number, _zoomLevel: number): Promise<string>;
    // (undocumented)
    drawTileDebugInfo(row: number, column: number, zoomLevel: number, context: CanvasRenderingContext2D): void;
    // (undocumented)
    get format(): ArcGisFeatureFormat | undefined;
    // (undocumented)
    getFeatureInfo(featureInfos: MapLayerFeatureInfo[], quadId: QuadId, carto: Cartographic, _tree: ImageryMapTileTree): Promise<void>;
    // (undocumented)
    protected getLayerMetadata(layerId: number): Promise<any>;
    // (undocumented)
    initialize(): Promise<void>;
    // (undocumented)
    loadTile(row: number, column: number, zoomLevel: number): Promise<ImageSource | undefined>;
    // (undocumented)
    get maximumZoomLevel(): number;
    // (undocumented)
    get minimumZoomLevel(): number;
    // (undocumented)
    serviceJson: any;
    // (undocumented)
    get tileSize(): number;
}

// @beta
export class MapLayersFormats {
    static initialize(): void;
}

// (No @packageDocumentation comment for this package)

```