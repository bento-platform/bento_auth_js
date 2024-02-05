# Bento Auth JS
The Bento authentication/authorization web client library, written in TypeScript for React Redux applications.

The authentication portion of this library works with OIDC providers, such as KeyCloak.

The authorization portion of this library works with applications protected by the [Bento Authorization Service](https://github.com/bento-platform/bento_authorization_service).

## Installation

Add `bento-auth-js` as a dependency to another project:

```bash
npm install bento-auth-js
```

## Usage

### Redux store setup.
Import the `bento-auth-js` reducers and add them to your application's Redux store.

```typescript
import {AuthReducer as auth, OIDCReducer as openIdConfiguration} from "bento-auth-js";

const rootReducer = combineReducers({
    auth,
    openIdConfiguration,
    // rest of reducers
})
```

You may use the `AuthReducer` alone if the application doesn't require authorization.
If you do need authorization, both reducers must be used by the store.


### Authenticating a user

Usually this is done in the top `App` component. The following example uses a pop-up window with PKCE flow.

```tsx
import {
    useHandleCallback,
    checkIsInAuthPopup,
    useIsAuthenticated,
    useOpenSignInWindowCallback,
    usePopupOpenerAuthCallback,
    useSignInPopupTokenHandoff,
    useSessionWorkerTokenRefresh,
    useOpenIdConfig,
} from "bento-auth-js";

import YourSessionWorker as SessionWorker from "../session.worker";
import { AUTH_CALLBACK_URL, BENTO_URL_NO_TRAILING_SLASH, CLIENT_ID, OPENID_CONFIG_URL } from "../config";
import { BentoAuthContext } from "./contexts";

// Session worker creator function must be in a constant for useSessionWorkerTokenRefresh
const createSessionWorker = () => new SessionWorker();

const App = () => {
    const dispatch = useDispatch();

    // Popup sign-in window and its message handler refs
    const signInWindow = useRef(null);
    const windowMessageHandler = useRef(null);

    // Get the OIDC config
    const openIdConfig = useOpenIdConfig(OPENID_CONFIG_URL);
    
    // Opens sign-in window
    const userSignIn = useOpenSignInWindowCallback(signInWindow, SIGN_IN_WINDOW_FEATURES);

    // Create the auth callback for the application's URL
    const popupOpenerAuthCallback = usePopupOpenerAuthCallback();

    const isInAuthPopup = checkIsInAuthPopup(BENTO_URL_NO_TRAILING_SLASH);

    // Assuming fetchUserDependentData is a thunk creator:
    // Using a thunk creator as a hook argument may lead to unwanted triggers on re-renders.
    // So we store the thunk inner function of the fetchUserDependentData thunk creator in a const.
    const onAuthSuccess = fetchUserDependentData(nop);

    // Auth code callback handling 
    useHandleCallback(
        CALLBACK_PATH,
        onAuthSuccess,
        isInAuthPopup ? popupOpenerAuthCallback : undefined,
    );
    
    // Token handoff with Proof Key for Code Exchange (PKCE) from the sing-in popup
    useSignInPopupTokenHandoff(windowMessageHandler);

    // Session worker tokens refresh
    useSessionWorkerTokenRefresh(
        sessionWorker,
        createSessionWorker,
        onAuthSuccess,
    );

    // Get user auth status
    const isAuthenticated = useIsAuthenticated();

    return (
        <>
            {
                isAuthenticated ? "User is signed in!" : <a onClick={userSignIn}>
                    Sign in to Bento
                </a>
            }
        </>
    );
}

const AppWithContext = () => (
    <BentoAuthContext {{
        applicationUrl: "(...)",
        openIdConfigUrl: "(...)",
        clientId: "(...)",
        scope: "openid email",
        postSignOutUrl: "/",
        authCallbackUrl: "(...)/callback",
    }}>
        <App />
    </BentoAuthContext>
);
```

### Authorization for a signed-in user

Client applications can evaluate user permissions with `bento-auth-js`.
These permissions can then be used to hide or show information, or to disable/enable features.

To evaluate a user's permissions on a resource:

```typescript
import { 
    useHasResourcePermission,
    useResourcePermissions,
    RESOURCE_EVERYTHING,
    viewDropBox,
    deleteDropBox,
} from "bento-auth-js";

// Get the authz url, here we assume it is somewhere in the store.
const authzUrl = useSelector((state) => state.services.itemsByKind?.authorization.url)

// Evaluates a single permission
const {isFetching, hasPermission} = useHasResourcePermission(RESOURCE_EVERYTHING, authzUrl, viewDropBox);

if (hasPermission) {
    // user can viewDropBox
}

// Returns the user's permissions on the resource
const {
    permissions,
    isFetching: isFetchingPermissions,
    hasAttempted: hasAttemptedPermissions,
} = useResourcePermissions(RESOURCE_EVERYTHING, authzUrl)

if (permissions.includes(deleteDropBox)) {
    // user can delete drop-box elements
}
```

**Note on authorization:**

With authorization in client/server applications, it is the server's duty to determine if the client's requests
should be allowed or rejected.

Therefore, client side permissions should only be used with services that implement authorization on the server side.

For example, simply disabling a delete button that performs a DELETE request to a Bento service (e.g. Drop Box)
is not secure if the service doesn't check if the user has the correct permissions with the authorization service.

You may use client side permissions to:
- Disable information displays that get their data from protected `GET` endpoints.
  - No need to show an empty display resulting from a 403 response to an unauthorized user
- Disable actions that use protected endpoints (`POST`, `PUT`, `DELETE`, ...)
  - No need for a button to be clickable if the user lacks the permissions for the resource.

## Release procedure

A commit on the `main` branch will trigger a build and release of the package to the npm Registry, no need to manually 
create tags thanks to semantic-release.

**Please follow the instructions bellow when writing your commits.**


### Semantic release
Bento Auth JS adheres to the [semver](https://semver.org/) versioning convention (Semantic Versioning). This repository uses the 
[semantic-release](https://github.com/semantic-release/semantic-release) library to automate the release of semver compliant packages to 
the npm Registry.

Semantic-release parses the commit messages in the release branch in order to determine the versioning changes. It does 
not rely on magic to work, but rather on specific commit message formats, which are described bellow.

### Commit message guidelines
Semantic-release uses the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification in order to parse relevant information.

```
<type>(<scope>): <short summary>
  │       │             │
  │       │             └─⫸ Summary in present tense. Not capitalized. No period at the end.
  │       │
  │       └─⫸ Commit Scope: Optional, what was changed.
  │
  └─⫸ Commit Type: build|ci|docs|feat|fix|perf|refactor|test
```

Both `<type>` and `<short summary>` are mandatory, while `<scope>` is optional, but recommended for pretty release notes.

**Example commit messages**

After fixing a dependency issue:
```
fix(dependencies): resolve peer dependencies issues caused by React version
```

After adding a new resource:
```
feat(resource): add support for katsu data-types
```



## Commit with `commitlint`

[Commitlint](https://commitlint.js.org/#/) is a safeguard for commit message formats, which you can use to help write 
semver-compliant commits. [Husky](https://github.com/typicode/husky) is a git hooks tool that binds commitlint to the `git commit` command.

### Installation
Run these steps once to setup commitlint + husky.
```shell
# Install dev dependencies (commitlint & husky)
npm install
# Install husky git hook
npx husky install
# Add commitlint as a hook to husky
npx husky add .husky/commit-msg  'npx --no -- commitlint --edit ${1}'
```

### Usage
Use the git cli as you normally would to make your commits, commitlint will intercept your commit if it is malformed.

Example:
```bash
git commit -m "ci(semantic-release): add commitlint and husky as dev tools to write valid commits"
```



## Local development

For local development in a React/Redux app that uses bento-auth-js, you can follow these steps for your setup:

1. `build` and `pack` bento-auth-js
   ```bash
   # Builds package and creates a pack file in the "./packs" dir
   npm run buildpack
   ```

2. In the project using bento-auth-js, modify the bento-auth-js dependency in package.json so that the version number is now the absolute path to the pack file.
   ```diff
   - "bento-auth-js": "1.0.0",
   + "bento-auth-js": "file:~/bento-auth-js/packs/bento-auth-js-2.0.0.tgz",
   ```

3. Install the dependencies in the project
   ```bash
   npm install
   ```

**Note: you will need to repeat steps 1 and 3 everytime you want the changes to be applied to the app using 
`bento-auth-js`**
