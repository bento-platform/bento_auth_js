import { JWTPayload } from "jose";

export const buildUrlEncodedData = (obj: any) =>
    Object.entries(obj).reduce((params, [k, v]) => {
        if (v === null || v === undefined) return params;
        params.set(k, v.toString());
        return params;
    }, new URLSearchParams());


export const getIsAuthenticated = (idTokenContents: JWTPayload | null | undefined) =>
    !!idTokenContents && idTokenContents.exp && Math.round(new Date().getTime() / 1000) < idTokenContents.exp;

export const makeAuthorizationHeader = (token: string) => (token ? { Authorization: `Bearer ${token}` } : {});

export const recursiveOrderedObject = (x: any): any => {
    if (Array.isArray(x)) {
        // Don't sort array, but DO make sure each nested object has sorted keys
        return x.map((y) => recursiveOrderedObject(y));
    } else if (typeof x === "object" && x !== null) {
        return Object.keys(x)
            .sort()
            .reduce((acc: any, y: string) => {
                acc[y] = x[y];
                return acc;
            }, {});
    } else {
        return x; // Primitive
    }
};

export const popLocalStorageItem = (key: string) => {
    const val = localStorage.getItem(key);
    localStorage.removeItem(key);
    return val;
};

export const nop = () => {};
