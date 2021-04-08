/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Quantity
 */

import { QuantityConstants } from "../Constants";
import { QuantityError, QuantityStatus } from "../Exception";
import { UnitProps, UnitsProvider } from "../Interfaces";
import { DecimalPrecision, FormatTraits, formatTraitsToArray, FormatType, formatTypeToString, FractionalPrecision,
  getTraitString, parseFormatTrait, parseFormatType, parsePrecision, parseScientificType, parseShowSignOption, ScientificType,
  scientificTypeToString, ShowSignOption, showSignOptionToString } from "./FormatEnums";
import { CustomFormatProps, FormatProps, isCustomFormatProps } from "./Interfaces";

// cSpell:ignore ZERONORMALIZED, nosign, onlynegative, signalways, negativeparentheses
// cSpell:ignore trailzeroes, keepsinglezero, zeroempty, keepdecimalpoint, applyrounding, fractiondash, showunitlabel, prependunitlabel, exponentonlynegative

/** A class used to define the specifications for formatting quantity values. This class is typically loaded by reading [[FormatProps]].
 * @beta
 */
export class Format {
  private _name = "";
  protected _roundFactor: number = 0.0;
  protected _type: FormatType = FormatType.Decimal; // required; options are decimal, fractional, scientific, station
  protected _precision: number = DecimalPrecision.Six; // required
  protected _minWidth?: number; // optional; positive int
  protected _scientificType?: ScientificType; // required if type is scientific; options: normalized, zeroNormalized
  protected _showSignOption: ShowSignOption = ShowSignOption.OnlyNegative; // options: noSign, onlyNegative, signAlways, negativeParentheses
  protected _decimalSeparator: string = QuantityConstants.LocaleSpecificDecimalSeparator;
  protected _thousandSeparator: string = QuantityConstants.LocaleSpecificThousandSeparator;
  protected _uomSeparator = " "; // optional; default is " "; defined separator between magnitude and the unit
  protected _stationSeparator = "+"; // optional; default is "+"
  protected _stationOffsetSize?: number; // required when type is station; positive integer > 0
  protected _formatTraits: FormatTraits = 0x0;
  protected _spacer: string = " "; // optional; default is " "
  protected _includeZero: boolean = true; // optional; default is true
  protected _units?: Array<[UnitProps, string | undefined]>;
  protected _customProps?: any;  // used by custom formatters and parsers

  /** Constructor
   *  @param name     The name of a format specification. TODO: make optional or remove
   */
  constructor(name: string) {
    this._name = name;
  }

  public get name(): string { return this._name; }
  public get roundFactor(): number { return this._roundFactor; }
  public get type(): FormatType { return this._type; }
  public get precision(): DecimalPrecision | FractionalPrecision { return this._precision; }
  public get minWidth(): number | undefined { return this._minWidth; }
  public get scientificType(): ScientificType | undefined { return this._scientificType; }
  public get showSignOption(): ShowSignOption { return this._showSignOption; }
  public get decimalSeparator(): string { return this._decimalSeparator; }
  public get thousandSeparator(): string { return this._thousandSeparator; }
  public get uomSeparator(): string { return this._uomSeparator; }
  public get stationSeparator(): string { return this._stationSeparator; }
  public get stationOffsetSize(): number | undefined { return this._stationOffsetSize; }
  public get formatTraits(): FormatTraits { return this._formatTraits; }
  public get spacer(): string | undefined { return this._spacer; }
  public get includeZero(): boolean | undefined { return this._includeZero; }
  public get units(): Array<[UnitProps, string | undefined]> | undefined { return this._units; }
  public get hasUnits(): boolean { return this._units !== undefined && this._units.length > 0; }
  public get customProps(): any { return this._customProps; }

  public static isFormatTraitSetInProps(formatProps: FormatProps, trait: FormatTraits) {
    if (!formatProps.formatTraits)
      return false;
    const formatTraits = Array.isArray(formatProps.formatTraits) ? formatProps.formatTraits : formatProps.formatTraits.split(/,|;|\|/);
    const traitStr = getTraitString(trait);
    return formatTraits.find((traitEntry) => traitStr === traitEntry) ? true : false;
  }

  /** This method parses input string that is typically extracted for persisted JSON data and validates that the string is a valid FormatType. Throws exception if not valid. */
  private parseFormatTraits(formatTraitsFromJson: string | string[]) {
    const formatTraits = (Array.isArray(formatTraitsFromJson)) ? formatTraitsFromJson : formatTraitsFromJson.split(/,|;|\|/);
    formatTraits.forEach((formatTraitsString: string) => { // for each element in the string array
      const formatTrait = parseFormatTrait(formatTraitsString, this.name);
      if (formatTrait === undefined)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'formatTraits' attribute. The string '${formatTraitsString}' is not a valid format trait.`);
      this._formatTraits = this.formatTraits | formatTrait;
    });
  }

  /** This method returns true if the formatTrait is set in this Format object. */
  public hasFormatTraitSet(formatTrait: FormatTraits): boolean {
    return (this._formatTraits & formatTrait) === formatTrait;
  }

  private async createUnit(unitsProvider: UnitsProvider, name: string, label?: string): Promise<void> {
    if (name === undefined || typeof (name) !== "string" || (label !== undefined && typeof (label) !== "string")) // throws if name is undefined or name isn't a string or if label is defined and isn't a string
      throw new QuantityError(QuantityStatus.InvalidJson, `This Composite has a unit with an invalid 'name' or 'label' attribute.`);
    for (const unit of this.units!) {
      const unitObj = unit[0].name;
      if (unitObj.toLowerCase() === name.toLowerCase()) // duplicate names are not allowed
        throw new QuantityError(QuantityStatus.InvalidJson, `The unit ${unitObj} has a duplicate name.`);
    }
    const newUnit: UnitProps = await unitsProvider.findUnitByName(name);
    if (!newUnit || !newUnit.isValid)
      throw new QuantityError(QuantityStatus.InvalidJson, `Invalid unit name '${name}'.`);
    this.units!.push([newUnit, label]);
  }

  private loadFormatProperties(formatProps: FormatProps) {
    if (isCustomFormatProps(formatProps))
      this._customProps = formatProps.custom;

    const formatType = parseFormatType(formatProps.type, this.name);
    if (formatType === undefined)
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'type' attribute.`);
    this._type = formatType;

    if (formatProps.precision !== undefined) {
      if (!Number.isInteger(formatProps.precision)) // mut be an integer
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'precision' attribute. It should be an integer.`);

      const precision = parsePrecision(formatProps.precision, this._type, this.name);
      if (precision === undefined)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has invalid 'precision' attribute.`);
      this._precision = precision;
    }
    if (this.type === FormatType.Scientific) {
      if (undefined === formatProps.scientificType) // if format type is scientific and scientific type is undefined, throw
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has type 'Scientific' therefore attribute 'scientificType' is required.`);
      const scientificType = parseScientificType(formatProps.scientificType, this.name);
      if (scientificType === undefined)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'scientificType' attribute.`);
      this._scientificType = scientificType;
    }

    if (this.type === FormatType.Station) {
      if (undefined === formatProps.stationOffsetSize)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has type 'Station' therefore attribute 'stationOffsetSize' is required.`);
      if (!Number.isInteger(formatProps.stationOffsetSize) || formatProps.stationOffsetSize < 0) // must be a positive int > 0
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'stationOffsetSize' attribute. It should be a positive integer.`);
      this._stationOffsetSize = formatProps.stationOffsetSize;
    }

    if (undefined !== formatProps.roundFactor) { // optional; default is 0.0
      if (typeof (formatProps.roundFactor) !== "number")
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'roundFactor' attribute. It should be of type 'number'.`);
      if (formatProps.roundFactor !== this.roundFactor) // if roundFactor isn't default value of 0.0, reassign roundFactor variable
        this._roundFactor = formatProps.roundFactor;
    }

    if (undefined !== formatProps.minWidth) { // optional
      if (!Number.isInteger(formatProps.minWidth) || formatProps.minWidth < 0) // must be a positive int
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'minWidth' attribute. It should be a positive integer.`);
      this._minWidth = formatProps.minWidth;
    }

    if (undefined !== formatProps.showSignOption) { // optional; default is "onlyNegative"
      const signOption = parseShowSignOption(formatProps.showSignOption, this.name);
      if (signOption === undefined)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'showSignOption' attribute. It should be of type 'string'.`);
      this._showSignOption = signOption;
    }

    if (undefined !== formatProps.formatTraits && formatProps.formatTraits.length !== 0) { // FormatTraits is optional
      if (!Array.isArray(formatProps.formatTraits) && typeof (formatProps.formatTraits) !== "string") // must be either an array of strings or a string
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'formatTraits' attribute. It should be of type 'string' or 'string[]'.`);
      this.parseFormatTraits(formatProps.formatTraits); // check that all of the options for formatTraits are valid. If now, throw
    }

    if (undefined !== formatProps.decimalSeparator) { // optional
      if (typeof (formatProps.decimalSeparator) !== "string") // not a string or not a one character string
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'decimalSeparator' attribute. It should be of type 'string'.`);
      if (formatProps.decimalSeparator.length !== 1)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'decimalSeparator' attribute. It must be a one character string.`);
      this._decimalSeparator = formatProps.decimalSeparator;
    }

    if (undefined !== formatProps.thousandSeparator) { // optional
      if (typeof (formatProps.thousandSeparator) !== "string")
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'thousandSeparator' attribute. It should be of type 'string'.`);
      if (formatProps.thousandSeparator.length !== 1)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'thousandSeparator' attribute. It must be a one character string.`);
      this._thousandSeparator = formatProps.thousandSeparator;
    }

    if (undefined !== formatProps.uomSeparator) { // optional; default is " "
      if (typeof (formatProps.uomSeparator) !== "string")
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'uomSeparator' attribute. It should be of type 'string'.`);
      if (formatProps.uomSeparator.length < 0 || formatProps.uomSeparator.length > 1)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'uomSeparator' attribute. It must be empty or a string with a single character.`);
      this._uomSeparator = formatProps.uomSeparator;
    }

    if (undefined !== formatProps.stationSeparator) { // optional; default is "+"
      if (typeof (formatProps.stationSeparator) !== "string")
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'stationSeparator' attribute. It should be of type 'string'.`);
      if (formatProps.stationSeparator.length !== 1)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has an invalid 'stationSeparator' attribute. It must be a one character string.`);
      this._stationSeparator = formatProps.stationSeparator;
    }
  }

  /**
   * Populates this Format with the values from the provided.
   */
  public async fromJSON(unitsProvider: UnitsProvider, jsonObj: FormatProps): Promise<void> {
    this.loadFormatProperties(jsonObj);

    if (undefined !== jsonObj.composite) { // optional
      this._units = new Array<[UnitProps, string | undefined]>();
      if (jsonObj.composite.includeZero !== undefined) {
        if (typeof (jsonObj.composite.includeZero) !== "boolean") // includeZero must be a boolean IF it is defined
          throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has a Composite with an invalid 'includeZero' attribute. It should be of type 'boolean'.`);
        this._includeZero = jsonObj.composite.includeZero;
      }
      if (jsonObj.composite.spacer !== undefined) {  // spacer must be a string IF it is defined
        if (typeof (jsonObj.composite.spacer) !== "string")
          throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has a Composite with an invalid 'spacer' attribute. It must be of type 'string'.`);
        if (jsonObj.composite.spacer.length < 0 || jsonObj.composite.spacer.length > 1)
          throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has a Composite with an invalid 'spacer' attribute. It must be empty or a string with a single character.`);
        this._spacer = jsonObj.composite.spacer;
      }
      if (jsonObj.composite.units !== undefined) { // if composite is defined, it must be an array with 1-4 units
        if (!Array.isArray(jsonObj.composite.units)) { // must be an array
          throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has a Composite with an invalid 'units' attribute. It must be of type 'array'`);
        }
        if (jsonObj.composite.units.length > 0 && jsonObj.composite.units.length <= 4) { // Composite requires 1-4 units
          try {
            const createUnitPromises: Array<Promise<void>> = [];
            for (const unit of jsonObj.composite.units) {
              createUnitPromises.push(this.createUnit(unitsProvider, unit.name, unit.label));
            }

            await Promise.all(createUnitPromises);
          } catch (e) {
            throw e;
          }
        }
      }
      if (undefined === this.units || this.units.length === 0)
        throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${this.name} has a Composite with no valid 'units'`);
    }
  }

  /** Create a Format from FormatProps */
  public static async createFromJSON(name: string, unitsProvider: UnitsProvider, formatProps: FormatProps) {
    const actualFormat = new Format(name);
    await actualFormat.fromJSON(unitsProvider, formatProps);
    return actualFormat;
  }

  /**
   * Returns a JSON object that contain the specification for this Format.
   */
  public toJSON(): FormatProps {
    let composite;
    if (this.units) {
      const units = this.units.map((value) => {
        if (undefined !== value[1])
          return { name: value[0].name, label: value[1] };
        else
          return { name: value[0].name };
      });

      composite = {
        spacer: this.spacer,
        includeZero: this.includeZero,
        units,
      };
    }

    if (this.customProps)
      return {
        type: formatTypeToString(this.type),
        precision: this.precision,
        roundFactor: this.roundFactor,
        minWidth: this.minWidth,
        showSignOption: showSignOptionToString(this.showSignOption),
        formatTraits: formatTraitsToArray(this.formatTraits),
        decimalSeparator: this.decimalSeparator,
        thousandSeparator: this.thousandSeparator,
        uomSeparator: this.uomSeparator,
        scientificType: this.scientificType ? scientificTypeToString(this.scientificType) : undefined,
        stationOffsetSize: this.stationOffsetSize,
        stationSeparator: this.stationSeparator,
        composite,
        custom: this.customProps,
      } as CustomFormatProps;

    return {
      type: formatTypeToString(this.type),
      precision: this.precision,
      roundFactor: this.roundFactor,
      minWidth: this.minWidth,
      showSignOption: showSignOptionToString(this.showSignOption),
      formatTraits: formatTraitsToArray(this.formatTraits),
      decimalSeparator: this.decimalSeparator,
      thousandSeparator: this.thousandSeparator,
      uomSeparator: this.uomSeparator,
      scientificType: this.scientificType ? scientificTypeToString(this.scientificType) : undefined,
      stationOffsetSize: this.stationOffsetSize,
      stationSeparator: this.stationSeparator,
      composite,
    };
  }
}
