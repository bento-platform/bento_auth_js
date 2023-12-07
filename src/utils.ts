import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { makeResourceKey } from "./resources";
import { fetchResourcePermissions } from "./redux/authSlice";

export const buildUrlEncodedData = (obj: Object) =>
    Object.entries(obj).reduce((params, [k, v]) => {
        if (v === null || v === undefined) return params;
        params.set(k, v.toString());
        return params;
    }, new URLSearchParams());

export const getIsAuthenticated = (idTokenContents) =>
    !!idTokenContents && Math.round(new Date().getTime() / 1000) < idTokenContents.exp;

export const makeAuthorizationHeader = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

// TODO: move hooks to own file

export const useAuthorizationHeader = () => {
    const { accessToken } = useSelector((state) => state.auth);
    return useMemo(() => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), [accessToken]);
};

export const useResourcePermissions = (resource, authUrl) => {
    const dispatch = useDispatch();

    const haveAuthorizationService = !!authUrl;

    useEffect(() => {
        if (!haveAuthorizationService) return;
        dispatch(fetchResourcePermissions({ resource, authUrl }));
    }, [haveAuthorizationService, resource, authUrl]);

    const key = useMemo(() => makeResourceKey(resource), [resource]);

    const { permissions, isFetching, hasAttempted, error } =
        useSelector((state) => state.auth.resourcePermissions[key]) ?? {};

    return {
        permissions: permissions ?? [],
        isFetching: isFetching ?? false,
        hasAttempted: hasAttempted ?? false,
        error: error ?? "",
    };
};

export const useHasResourcePermission = (resource: string, authUrl: string, permission: string) => {
    const { permissions, isFetching } = useResourcePermissions(resource, authUrl) ?? {};
    return { isFetching, hasPermission: permissions.includes(permission) };
};

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
