import { recursiveOrderedObject } from "./utils";

/**
 * Resources are expressed as simple key-value pairs.
 * Where the key is always a string identifying the resource type,
 * and the value is either a string identifying the resource ID,
 * or a boolean for everything.
 *
 * e.g. The resource for a project with ID "project-1" would be expressed as:
 * { "project": "project-1" }
 */
export type Resource = { everything: true } | { project: string; dataset?: string; data_type?: string };

export const RESOURCE_EVERYTHING: Resource = { everything: true };

export const makeProjectResource = (projectId: string): Resource => {
    return {
        project: projectId,
    };
};

export const makeProjectDataTypeResource = (projectId: string, dataType: string): Resource => {
    return {
        ...makeProjectResource(projectId),
        data_type: dataType,
    };
};

export const makeProjectDatasetResource = (projectId: string, datasetId: string): Resource => {
    return {
        ...makeProjectResource(projectId),
        dataset: datasetId,
    };
};

export const makeProjectDatasetDataTypeResource = (
    projectId: string,
    datasetId: string,
    dataType: string,
): Resource => {
    return {
        ...makeProjectDatasetResource(projectId, datasetId),
        data_type: dataType,
    };
};

// TODO: use records instead of JSON string (when formalized):
export const makeResourceKey = (x: Resource) => JSON.stringify(recursiveOrderedObject(x));
