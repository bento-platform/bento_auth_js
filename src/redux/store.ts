import { Dispatch, configureStore, createAsyncThunk } from "@reduxjs/toolkit";
import auth from "./authSlice";
import openIdConfiguration from "./openIdConfigSlice";
import { useDispatch } from "react-redux";

const authStore = configureStore({
    reducer: {
        auth,
        openIdConfiguration,
    }
});

export type RootState = ReturnType<typeof authStore.getState>;

export type AppDispatch = typeof authStore.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;

export type ThunkConfig = {
    state: RootState
    dispatch: AppDispatch
}

// export const createAppAsyncThunk = createAsyncThunk.withTypes<ThunkConfig>();

export default authStore;
