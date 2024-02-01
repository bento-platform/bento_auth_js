import { createContext, useContext } from "react";

export interface BentoAuthContextObject {
    applicationUrl?: string;
    openIdConfigUrl?: string;
    clientId?: string;
    scope?: string;
    // Application URLs:
    postSignOutUrl?: string;
    authCallbackUrl?: string;
}

export const DEFAULT_AUTH_SCOPE = "openid email";

const defaultContextObject: BentoAuthContextObject = {
    scope: DEFAULT_AUTH_SCOPE,
};

export const BentoAuthContext = createContext<BentoAuthContextObject>(defaultContextObject);

export const useBentoAuthContext = () => {
    return useContext(BentoAuthContext);
};
