import React from "react";
import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
} from "recoil";

const user = atom({
  key: "user",
  default: null,
});

export default {
  user,
};
