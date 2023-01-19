/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Hierarchies
 */

import { LabelDefinition, LabelDefinitionJSON } from "../LabelDefinition";
import { NodeKey, NodeKeyJSON } from "./Key";

/**
 * Data structure that describes a tree node.
 * @public
 */
export interface Node {
  /** A key that uniquely identifies a node. */
  key: NodeKey;
  /** Definition of node display label */
  label: LabelDefinition;
  /** Extensive description */
  description?: string;
  /**
   * Image ID
   * @deprecated Use [[extendedData]] instead. See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
   */
  imageId?: string;
  /**
   * Foreground color
   * @deprecated Use [[extendedData]] instead. See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
   */
  foreColor?: string;
  /**
   * Background color
   * @deprecated Use [[extendedData]] instead. See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
   */
  backColor?: string;
  /**
   * Font style
   * @deprecated Use [[extendedData]] instead. See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
   */
  fontStyle?: string;
  /** Does this node have child nodes */
  hasChildren?: boolean;
  /** Is this node selectable */
  isSelectionDisabled?: boolean;
  /** Is this node editable */
  isEditable?: boolean;
  /** Is this node expanded */
  isExpanded?: boolean;
  /**
   * Is checkbox visible for this node
   * @deprecated Use [[extendedData]] instead. See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
   */
  isCheckboxVisible?: boolean;
  /**
   * Is this node's checkbox checked
   * @deprecated Use [[extendedData]] instead. See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
   */
  isChecked?: boolean;
  /**
   * Is this node's checkbox enabled
   * @deprecated Use [[extendedData]] instead. See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
   */
  isCheckboxEnabled?: boolean;
  /**
   * Identifies whether the hierarchy level below this node supports filtering. If not, requesting either a hierarchy level descriptor or
   * a hierarchy level with [[HierarchyRequestOptions.instanceFilter]] will throw an error with [[PresentationStatus.InvalidArgument]] status.
   * @alpha
   */
  supportsFiltering?: boolean;
  /** Extended data injected into this node */
  extendedData?: {
    [key: string]: any;
  };
}

/**
 * Serialized [[Node]] JSON representation.
 * @public
 */
export interface NodeJSON {
  key: NodeKeyJSON;
  labelDefinition: LabelDefinitionJSON;
  description?: string;
  /** @deprecated */
  imageId?: string;
  /** @deprecated */
  foreColor?: string;
  /** @deprecated */
  backColor?: string;
  /** @deprecated */
  fontStyle?: string;
  hasChildren?: boolean;
  isSelectionDisabled?: boolean;
  isEditable?: boolean;
  isExpanded?: boolean;
  /** @deprecated */
  isCheckboxVisible?: boolean;
  /** @deprecated */
  isChecked?: boolean;
  /** @deprecated */
  isCheckboxEnabled?: boolean;
  /** @alpha */
  supportsFiltering?: boolean;
  extendedData?: {
    [key: string]: any;
  };
}

/**
 * Partial node definition.
 * @public
 */
export type PartialNode = AllOrNone<Partial<Node>, "key" | "label">;

/**
 * Serialized [[PartialNode]] JSON representation.
 * @public
 */
export type PartialNodeJSON = AllOrNone<Partial<NodeJSON>, "key" | "labelDefinition">;

type AllOrNone<T, P extends keyof T> = Omit<T, P> & ({ [K in P]?: never } | Required<Pick<T, P>>);

/** @public */
export namespace Node {
  /** Serialize given [[Node]] to JSON */
  export function toJSON(node: Node): NodeJSON {
    const { key, label, ...baseNode } = node;
    return {
      ...baseNode,
      key: NodeKey.toJSON(key),
      labelDefinition: LabelDefinition.toJSON(label),
    };
  }

  /** @internal */
  export function toPartialJSON(node: PartialNode): PartialNodeJSON {
    if (node.key === undefined) {
      return node;
    }

    const { key, label, ...baseNode } = node;
    return {
      ...baseNode,
      key: NodeKey.toJSON(key),
      labelDefinition: LabelDefinition.toJSON(label),
    };
  }

  /** Deserialize [[Node]] from JSON */
  export function fromJSON(json: NodeJSON | string): Node {
    if (typeof json === "string")
      return JSON.parse(json, reviver);
    const { labelDefinition, ...baseJson } = json;
    return {
      ...baseJson,
      key: NodeKey.fromJSON(json.key),
      label: LabelDefinition.fromJSON(labelDefinition),
    };
  }

  /** @internal */
  export function fromPartialJSON(json: PartialNodeJSON): PartialNode {
    if (json.key === undefined) {
      return json;
    }

    const { key, labelDefinition, ...baseJson } = json;
    return {
      ...baseJson,
      key: NodeKey.fromJSON(key),
      label: LabelDefinition.fromJSON(labelDefinition),
    };
  }

  /**
   * Reviver function that can be used as a second argument for
   * `JSON.parse` method when parsing [[Node]] objects.
   *
   * @internal
   */
  export function reviver(key: string, value: any): any {
    return key === "" ? fromJSON(value) : value;
  }

  /**
   * Deserialize nodes list from JSON
   * @param json JSON or JSON serialized to string to deserialize from
   * @returns Deserialized nodes list
   *
   * @internal
   */
  export function listFromJSON(json: NodeJSON[] | string): Node[] {
    if (typeof json === "string")
      return JSON.parse(json, listReviver);
    return json.map((m) => fromJSON(m));
  }

  /**
   * Reviver function that can be used as a second argument for
   * `JSON.parse` method when parsing [[Node]][] objects.
   *
   * @internal
   */
  export function listReviver(key: string, value: any): any {
    return key === "" ? listFromJSON(value) : value;
  }
}
