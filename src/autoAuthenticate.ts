import { useEffect, useState } from "react";
import { useIsAuthenticated, useOpenIdConfig } from "./hooks";
import { LS_BENTO_WAS_SIGNED_IN, setLSNotSignedIn, usePerformAuth } from "./performAuth";

export interface AutoAuthenticateState {
    isAutoAuthenticating: boolean;
}

export const useAutoAuthenticate = (): AutoAuthenticateState => {
    const [isAutoAuthenticating, setIsAutoAuthenticating] = useState(false);

    const isAuthenticated = useIsAuthenticated();
    const openIdConfig = useOpenIdConfig();
    const performAuth = usePerformAuth();

    const authzEndpoint = openIdConfig?.["authorization_endpoint"];

    useEffect(() => {
        if (
            !isAuthenticated &&
            !isAutoAuthenticating &&
            authzEndpoint &&
            localStorage.getItem(LS_BENTO_WAS_SIGNED_IN) === "true"
        ) {
            console.debug("auto-authenticating");
            setLSNotSignedIn();
            setIsAutoAuthenticating(true);
            performAuth().catch(console.error);
        }
    }, [authzEndpoint, isAuthenticated, isAutoAuthenticating]);

    return { isAutoAuthenticating };
};
