import { recursiveOrderedObject } from "./utils";

export const RESOURCE_EVERYTHING = { everything: true };

// TODO: use records instead of JSON string (when formalized):
export const makeResourceKey = (x: any) => JSON.stringify(recursiveOrderedObject(x));
