import { configureStore } from "@reduxjs/toolkit";
import auth from "./authSlice";
import openIdConfiguration from "./openIdConfigSlice";
import { useDispatch } from "react-redux";

// This store is only created as a way to export its state and dispatch types
const authStore = configureStore({
    reducer: {
        auth,
        openIdConfiguration,
    },
    devTools: false,
});

export type RootState = ReturnType<typeof authStore.getState>;

export type AppDispatch = typeof authStore.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
