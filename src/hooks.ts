import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Resource, makeResourceKey } from "./resources";
import { fetchResourcePermissions } from "./redux/authSlice";
import { RootState } from "./redux/store";

export const useAuthorizationHeader = () => {
    const { accessToken } = useSelector((state: RootState) => state.auth);
    return useMemo(() => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), [accessToken]);
};

export const useResourcePermissions = (resource: Resource, authzUrl: string) => {
    const dispatch = useDispatch();

    const haveAuthorizationService = !!authzUrl;

    useEffect(() => {
        if (!haveAuthorizationService) return;
        dispatch(fetchResourcePermissions({ resource, authzUrl }));
    }, [haveAuthorizationService, resource, authzUrl]);

    const key = useMemo(() => makeResourceKey(resource), [resource]);

    const { permissions, isFetching, hasAttempted, error } =
        useSelector((state: RootState) => state.auth.resourcePermissions?.[key]) ?? {};

    return {
        permissions: permissions ?? [],
        isFetching: isFetching ?? false,
        hasAttempted: hasAttempted ?? false,
        error: error ?? "",
    };
};

export const useHasResourcePermission = (resource: Resource, authzUrl: string, permission: string) => {
    const { permissions, isFetching } = useResourcePermissions(resource, authzUrl) ?? {};
    return { isFetching, hasPermission: permissions.includes(permission) };
};
