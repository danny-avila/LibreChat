import { r as reactExports, j as jsxRuntimeExports } from "./vendor.BvsoAGbO.js";
import { S as Ss, l as ls, E as Ea, u as useBookmarkContext, a as useLocalize, n as na, c as cn, B as BookmarkContext } from "./index.cQZt8u6_.js";
import { a5 as BookmarkFilledIcon, a6 as BookmarkIcon, a7 as CrossCircledIcon } from "./radix-ui.8KKlK2TJ.js";
import "./utilities.CVXNr5op.js";
import { d as useQuery } from "./tanstack-vendor.DkEt8I7O.js";
import { E as Et, l as lo, y as yt, P as Pt } from "./headlessui.DrtLdk8J.js";
import "./react-interactions.4iR9Y8H6.js";
import "./markdown_highlight.Dn3AXrA4.js";
import "./validation.D20cTP0S.js";
import "./sandpack.BLzzmAt7.js";
import "./codemirror.lsfbTDax.js";
import "./math-katex.Cx_VYzRJ.js";
import "./locales.CJfaKj0a.js";
import "./i18n.CuH225FP.js";
import "./routing.Cr2RAdnx.js";
import "./avatars.DU1jF2ms.js";
import "./advanced-inputs.CTjcNtkx.js";
import "./animations.Bgowhwhb.js";
import "./virtualization.CouYgKQb.js";
import "./framer-motion.Cc1_2i5_.js";
import "./http-client.DRDfV0Q7.js";
import "./date-utils.DYP76VzI.js";
import "./forms.DG_IZ1gg.js";
import "./security-ui.ChzcZgAf.js";
import "./markdown-processing.-DQOxylK.js";
import "./heic-converter.BWwAQ4DZ.js";
const useGetConversationTags = (config) => {
  return useQuery(
    [ls.conversationTags],
    () => Ss.getConversationTags(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config
    }
  );
};
const BookmarkItem = ({ tag, selected, handleSubmit, icon, ...rest }) => {
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const clickHandler = async () => {
    if (tag === "New Bookmark") {
      handleSubmit();
      return;
    }
    setIsLoading(true);
    handleSubmit(tag);
    setIsLoading(false);
  };
  const breakWordStyle = {
    wordBreak: "break-word",
    overflowWrap: "anywhere"
  };
  const renderIcon = () => {
    if (icon != null) {
      return icon;
    }
    if (isLoading) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Ea, { className: "size-4" });
    }
    if (selected) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(BookmarkFilledIcon, { className: "size-4" });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx(BookmarkIcon, { className: "size-4" });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Et,
    {
      "aria-label": tag,
      className: "group flex w-full gap-2 rounded-lg p-2.5 text-sm text-text-primary transition-colors duration-200 focus:outline-none data-[focus]:bg-surface-hover data-[focus-visible]:ring-2 data-[focus-visible]:ring-primary",
      ...rest,
      as: "button",
      onClick: clickHandler,
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex grow items-center justify-between gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        renderIcon(),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: breakWordStyle, children: tag })
      ] }) })
    }
  );
};
const BookmarkItems = ({ tags, handleSubmit, header }) => {
  const { bookmarks } = useBookmarkContext();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    header,
    bookmarks.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "my-1.5 h-px", role: "none" }),
    bookmarks.map((bookmark, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      BookmarkItem,
      {
        tag: bookmark.tag,
        selected: tags.includes(bookmark.tag),
        handleSubmit
      },
      `${bookmark._id ?? bookmark.tag}-${i}`
    ))
  ] });
};
const BookmarkNavItems = ({ tags = [], setTags }) => {
  const { bookmarks } = useBookmarkContext();
  const localize = useLocalize();
  const getUpdatedSelected = (tag) => {
    if (tags.some((selectedTag) => selectedTag === tag)) {
      return tags.filter((selectedTag) => selectedTag !== tag);
    } else {
      return [...tags, tag];
    }
  };
  const handleSubmit = (tag) => {
    if (tag === void 0) {
      return;
    }
    const updatedSelected = getUpdatedSelected(tag);
    setTags(updatedSelected);
    return;
  };
  const clear = () => {
    setTags([]);
    return;
  };
  if (bookmarks.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        BookmarkItem,
        {
          tag: localize("com_ui_clear_all"),
          "data-testid": "bookmark-item-clear",
          handleSubmit: clear,
          selected: false,
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CrossCircledIcon, { className: "size-4" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        BookmarkItem,
        {
          tag: localize("com_ui_no_bookmarks"),
          "data-testid": "bookmark-item-no-bookmarks",
          handleSubmit: () => Promise.resolve(),
          selected: false,
          icon: "🤔"
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    BookmarkItems,
    {
      tags,
      handleSubmit,
      header: /* @__PURE__ */ jsxRuntimeExports.jsx(
        BookmarkItem,
        {
          tag: localize("com_ui_clear_all"),
          "data-testid": "bookmark-item-clear",
          handleSubmit: clear,
          selected: false,
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CrossCircledIcon, { className: "size-4" })
        }
      )
    }
  ) });
};
const BookmarkNav = ({ tags, setTags, isSmallScreen }) => {
  const localize = useLocalize();
  const { data } = useGetConversationTags();
  const label = reactExports.useMemo(
    () => tags.length > 0 ? tags.join(", ") : localize("com_ui_bookmarks"),
    [tags, localize]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx(lo, { as: "div", className: "group relative", children: ({ open }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      na,
      {
        description: label,
        render: /* @__PURE__ */ jsxRuntimeExports.jsx(
          yt,
          {
            id: "bookmark-menu-button",
            "aria-label": localize("com_ui_bookmarks"),
            className: cn(
              "flex items-center justify-center",
              "size-10 border-none text-text-primary hover:bg-accent hover:text-accent-foreground",
              "rounded-full border-none p-2 hover:bg-surface-hover md:rounded-xl",
              open ? "bg-surface-hover" : ""
            ),
            "data-testid": "bookmark-menu",
            children: tags.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(BookmarkFilledIcon, { className: "icon-lg text-text-primary", "aria-hidden": "true" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(BookmarkIcon, { className: "icon-lg text-text-primary", "aria-hidden": "true" })
          }
        )
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Pt,
      {
        anchor: "bottom",
        className: "absolute left-0 top-full z-[100] mt-1 w-60 translate-y-0 overflow-hidden rounded-lg bg-surface-secondary p-1.5 shadow-lg outline-none",
        children: data && /* @__PURE__ */ jsxRuntimeExports.jsx(BookmarkContext.Provider, { value: { bookmarks: data.filter((tag) => tag.count > 0) }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          BookmarkNavItems,
          {
            tags,
            setTags
          }
        ) })
      }
    )
  ] }) });
};
export {
  BookmarkNav as default
};
