import { MutableRefObject, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Resource, makeResourceKey } from "./resources";
import { fetchResourcePermissions, refreshTokens, tokenHandoff } from "./redux/authSlice";
import { RootState } from "./redux/store";
import { LS_SIGN_IN_POPUP } from "./performAuth";

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

export const useSignInPopupMessaging = (
    applicationUrl: string,
    authCallBackUrl: string,
    clientId: string,
    windowMessageHandler: MutableRefObject<null | ((e: MessageEvent) => void)>
) => {
    const dispatch = useDispatch();
    useEffect(() => {
        if (windowMessageHandler.current) {
            window.removeEventListener("message", windowMessageHandler.current);
        }
        windowMessageHandler.current = (e: MessageEvent) => {
            if (e.origin !== applicationUrl) return;
            if (e.data?.type !== "authResult") return;
            const { code, verifier } = e.data ?? {};
            if (!code || !verifier) return;
            localStorage.removeItem(LS_SIGN_IN_POPUP);
            dispatch(tokenHandoff({ code, verifier, clientId: clientId, authCallbackUrl: authCallBackUrl }));
        };
        window.addEventListener("message", windowMessageHandler.current);

    }, [dispatch]);
};

export const useSessionWorker = (
    clientId: string,
    sessionWorkerRef: MutableRefObject<null | EventSource>,
    createWorker: () => EventSource,
    fetchUserDependentData: (servicesCb: () => void) => void,
) => {
    const dispatch = useDispatch();
    useEffect(() => {
        if (!sessionWorkerRef.current) {
            const sw = createWorker();
            sw.addEventListener("message", () => {
                dispatch(refreshTokens(clientId));
                dispatch(fetchUserDependentData);
            });
            sessionWorkerRef.current = sw;
        }
    }, [dispatch, sessionWorkerRef]);
}
