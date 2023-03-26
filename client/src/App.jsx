import React, { useEffect, useState } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import Root from "./routes/Root";
import Chat from "./routes/Chat";
import store from "./store";
import { useRecoilState } from "recoil";

import axios from "axios";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      {
        index: true,
        element: <Navigate to="/chat/new" replace={true} />,
      },
      {
        path: "chat/:conversationId",
        element: <Chat />,
      },
    ],
  },
]);

const App = () => {
  const [user, setUser] = useRecoilState(store.user);

  useEffect(() => {
    axios
      .get("/api/me", {
        timeout: 1000,
        withCredentials: true,
      })
      .then((res) => {
        return res.data;
      })
      .then((user) => {
        if (user) setUser(user);
        else {
          console.log("Not login!");
          window.location.href = "/auth/login";
        }
      })
      .catch((error) => {
        console.error(error);
        console.log("Not login!");
        window.location.href = "/auth/login";
      });
    // setUser
  }, []);

  if (user) return <RouterProvider router={router} />;
  else return <div className="flex h-screen"></div>;
};

export default App;
