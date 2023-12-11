import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { makeResourceKey } from "./resources";
import { fetchResourcePermissions } from "./redux/authSlice";
import { RootState } from "./redux/store";

export const useAuthorizationHeader = () => {
    const { accessToken } = useSelector((state: RootState) => state.auth);
    return useMemo(() => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), [accessToken]);
};

export const useResourcePermissions = (resource: string, authUrl: string) => {
    const dispatch = useDispatch();

    const haveAuthorizationService = !!authUrl;

    useEffect(() => {
        if (!haveAuthorizationService) return;
        dispatch(fetchResourcePermissions({ resource, authzUrl: authUrl }));
    }, [haveAuthorizationService, resource, authUrl]);

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

export const useHasResourcePermission = (resource: string, authUrl: string, permission: string) => {
    const { permissions, isFetching } = useResourcePermissions(resource, authUrl) ?? {};
    return { isFetching, hasPermission: permissions.includes(permission) };
};
