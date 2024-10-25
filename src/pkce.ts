// Adapted from https://developer.okta.com/blog/2019/05/01/is-the-oauth-implicit-flow-dead

export const PKCE_LS_PREFIX = "pkce";
export const PKCE_LS_STATE = `${PKCE_LS_PREFIX}_state`;
export const PKCE_LS_VERIFIER = `${PKCE_LS_PREFIX}_verifier`;

/** Create a securely random string */
export const secureRandomString = (length: number = 32): string =>
    Array.from(
        crypto.getRandomValues(new Uint32Array(length)),
        (v) => ("0" + v.toString(16)).slice(-2), // Prepend with 0 to prevent slice from yielding only 1 char
    ).join("");

/** Generates a SHA256 hash of a given string. */
const textSHA256 = (v: string): Promise<ArrayBuffer> => crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));

/** Create a URL-safe base-64 representation of an ArrayBuffer containing the bytes of a cryptographic hash. */
const b64URLEncode = (v: ArrayBuffer): string =>
    btoa(String.fromCharCode(...new Uint8Array(v)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

/** Create a PKCE (proof key for code exchange) challenge from a given securely randomly-generated string (verifier). */
export const pkceChallengeFromVerifier = async (v: string): Promise<string> => b64URLEncode(await textSHA256(v));
