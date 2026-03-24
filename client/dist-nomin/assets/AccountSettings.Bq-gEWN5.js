import { j as jsxRuntimeExports, cI as ListFilter, ei as FilterX, eb as ArrowUpDown, cS as Database, r as reactExports, c6 as Recoil_index_24, c5 as Recoil_index_22, bS as SelectProvider, bm as Select, bo as SelectPopover, bu as SelectItem, ej as FileText, ek as LogOut } from "./vendor.BvsoAGbO.js";
import { b as useDeleteFilesMutation, l as ls, d as useFileDeletion, a as useLocalize, c as cn, A as Account, H as Ht, e as Bt, R as Rt, j as jt, Z as Zt, f as At, V as Vt, I as ImagePreview, g as getFileType, F as FilePreview, h as nr, i as formatDate, k as Ze, v as vn, C as Cn, m as Ft, s as store, E as Ea, o as gn, y as yr, P as Pt, p as Ar, $ as $r, _ as _r, G as Gr, q as Fr, r as qr, t as useGetFiles, L as Lr, w as Vr, x as Hr, z as Br, D as useAuthContext, J as useGetStartupConfig, K as useGetUserBalance, M as no, N as mn, O as pn } from "./index.cQZt8u6_.js";
import "./utilities.CVXNr5op.js";
import { a8 as ArrowDownIcon, a9 as ArrowUpIcon, F as CaretSortIcon } from "./radix-ui.8KKlK2TJ.js";
import { h as useQueryClient, u as useReactTable, m as getPaginationRowModel, g as getFilteredRowModel, b as getSortedRowModel, c as getCoreRowModel, f as flexRender } from "./tanstack-vendor.DkEt8I7O.js";
import { z as ze, L as Lt, F as Fe, q as qe, c as ze$1 } from "./headlessui.DrtLdk8J.js";
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
function useDeleteFilesFromTable(callback) {
  const queryClient = useQueryClient();
  const deletionMutation = useDeleteFilesMutation({
    onMutate: async (variables) => {
      const { files } = variables;
      if (!files.length) {
        return /* @__PURE__ */ new Map();
      }
      const filesToDeleteMap = files.reduce((map, file) => {
        map.set(file.file_id, file);
        return map;
      }, /* @__PURE__ */ new Map());
      return { filesToDeleteMap };
    },
    onSuccess: (data, variables, context) => {
      console.log("Files deleted");
      const { filesToDeleteMap } = context;
      queryClient.setQueryData([ls.files], (oldFiles) => {
        const { files } = variables;
        return files.length ? oldFiles == null ? void 0 : oldFiles.filter((file) => !filesToDeleteMap.has(file.file_id)) : oldFiles;
      });
      callback == null ? void 0 : callback();
    },
    onError: (error) => {
      console.log("Error deleting files:", error);
      callback == null ? void 0 : callback();
    }
  });
  return useFileDeletion({ mutateAsync: deletionMutation.mutateAsync });
}
function Settings({ open, onOpenChange }) {
  const localize = useLocalize();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ze, { appear: true, show: open, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Lt, { as: "div", className: "relative z-50", onClose: onOpenChange, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Fe,
      {
        enter: "ease-out duration-200",
        enterFrom: "opacity-0",
        enterTo: "opacity-100",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100",
        leaveTo: "opacity-0",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 bg-black opacity-50 dark:opacity-80", "aria-hidden": "true" })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Fe,
      {
        enter: "ease-out duration-200",
        enterFrom: "opacity-0 scale-95",
        enterTo: "opacity-100 scale-100",
        leave: "ease-in duration-100",
        leaveFrom: "opacity-100 scale-100",
        leaveTo: "opacity-0 scale-95",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("fixed inset-0 flex w-screen items-center justify-center p-4"), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          qe,
          {
            className: cn(
              "min-h-[600px] overflow-hidden rounded-xl rounded-b-lg bg-background pb-6 shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl md:min-h-[373px] md:w-[680px]"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                ze$1,
                {
                  className: "mb-1 flex items-center justify-between p-6 pb-5 text-left",
                  as: "div",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-medium leading-6 text-text-primary", children: localize("com_nav_settings") }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "button",
                      {
                        type: "button",
                        className: "rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-primary dark:focus:ring-offset-surface-primary",
                        onClick: () => onOpenChange(false),
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "svg",
                            {
                              xmlns: "http://www.w3.org/2000/svg",
                              width: "24",
                              height: "24",
                              viewBox: "0 0 24 24",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: "2",
                              strokeLinecap: "round",
                              strokeLinejoin: "round",
                              className: "h-5 w-5 text-text-primary",
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "18", x2: "6", y1: "6", y2: "18" }),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "6", x2: "18", y1: "6", y2: "18" })
                              ]
                            }
                          ),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: localize("com_ui_close_settings") })
                        ]
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-h-[550px] overflow-auto px-6 md:max-h-[400px] md:min-h-[400px] md:w-[680px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Account, {}) })
            ]
          }
        ) })
      }
    )
  ] }) });
}
function SortFilterHeader({
  column,
  title,
  className = "",
  filters,
  valueMap
}) {
  const localize = useLocalize();
  if (!column.getCanSort()) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn(className), children: title });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("flex items-center space-x-2", className), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Ht, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Bt, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Rt,
      {
        variant: "ghost",
        className: "px-2 py-0 text-xs hover:bg-surface-hover data-[state=open]:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: title }),
          column.getIsFiltered() ? /* @__PURE__ */ jsxRuntimeExports.jsx(ListFilter, { className: "icon-sm ml-2 text-muted-foreground/70" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ListFilter, { className: "icon-sm ml-2 opacity-30" }),
          (() => {
            const sortState = column.getIsSorted();
            if (sortState === "desc") {
              return /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowDownIcon, { className: "icon-sm ml-2" });
            }
            if (sortState === "asc") {
              return /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowUpIcon, { className: "icon-sm ml-2" });
            }
            return /* @__PURE__ */ jsxRuntimeExports.jsx(CaretSortIcon, { className: "icon-sm ml-2" });
          })()
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      jt,
      {
        align: "start",
        className: "z-[1001] dark:border-gray-700 dark:bg-gray-850",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Zt,
            {
              onClick: () => column.toggleSorting(false),
              className: "cursor-pointer text-text-primary",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowUpIcon, { className: "mr-2 h-3.5 w-3.5 text-muted-foreground/70" }),
                localize("com_ui_ascending")
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Zt,
            {
              onClick: () => column.toggleSorting(true),
              className: "cursor-pointer text-text-primary",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowDownIcon, { className: "mr-2 h-3.5 w-3.5 text-muted-foreground/70" }),
                localize("com_ui_descending")
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(At, { className: "dark:bg-gray-500" }),
          filters && Object.entries(filters).map(
            ([key, values]) => values.map((value) => {
              const translationKey = valueMap == null ? void 0 : valueMap[value ?? ""];
              const filterValue = translationKey != null && translationKey.length ? localize(translationKey) : String(value);
              if (!filterValue) {
                return null;
              }
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                Zt,
                {
                  className: "cursor-pointer text-text-primary",
                  onClick: () => {
                    column.setFilterValue(value);
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(ListFilter, { className: "mr-2 h-3.5 w-3.5 text-muted-foreground/70" }),
                    filterValue
                  ]
                },
                `${key}-${value}`
              );
            })
          ),
          filters && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Zt,
            {
              className: column.getIsFiltered() ? "cursor-pointer dark:text-white dark:hover:bg-gray-800" : "pointer-events-none opacity-30",
              onClick: () => {
                column.setFilterValue(void 0);
              },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(FilterX, { className: "mr-2 h-3.5 w-3.5 text-muted-foreground/70" }),
                localize("com_ui_show_all")
              ]
            }
          )
        ]
      }
    )
  ] }) });
}
const contextMap$1 = {
  [Ft.avatar]: "com_ui_avatar",
  [Ft.unknown]: "com_ui_unknown",
  [Ft.assistants]: "com_ui_assistants",
  [Ft.image_generation]: "com_ui_image_gen",
  [Ft.assistants_output]: "com_ui_assistants_output",
  [Ft.message_attachment]: "com_ui_attachment"
};
const columns = [
  {
    id: "select",
    header: ({ table }) => {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        Vt,
        {
          checked: table.getIsAllPageRowsSelected() || table.getIsSomePageRowsSelected() && "indeterminate",
          onCheckedChange: (value) => table.toggleAllPageRowsSelected(!!value),
          "aria-label": "Select all",
          className: "flex"
        }
      );
    },
    cell: ({ row }) => {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        Vt,
        {
          checked: row.getIsSelected(),
          onCheckedChange: (value) => row.toggleSelected(!!value),
          "aria-label": "Select row",
          className: "flex"
        }
      );
    },
    enableSorting: false,
    enableHiding: false
  },
  {
    meta: {
      size: "150px"
    },
    accessorKey: "filename",
    header: ({ column }) => {
      const localize = useLocalize();
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Rt,
        {
          variant: "ghost",
          className: "px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
          children: [
            localize("com_ui_name"),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowUpDown, { className: "ml-2 h-3 w-4 sm:h-4 sm:w-4" })
          ]
        }
      );
    },
    cell: ({ row }) => {
      var _a;
      const file = row.original;
      if ((_a = file.type) == null ? void 0 : _a.startsWith("image")) {
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ImagePreview,
            {
              url: file.filepath,
              className: "relative h-10 w-10 shrink-0 overflow-hidden rounded-md",
              source: file.source
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "self-center truncate", children: file.filename })
        ] });
      }
      const fileType = getFileType(file.type);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        fileType && /* @__PURE__ */ jsxRuntimeExports.jsx(FilePreview, { fileType, className: "relative", file }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "self-center truncate", children: file.filename })
      ] });
    }
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => {
      const localize = useLocalize();
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Rt,
        {
          variant: "ghost",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
          className: "px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm",
          children: [
            localize("com_ui_date"),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowUpDown, { className: "ml-2 h-3 w-4 sm:h-4 sm:w-4" })
          ]
        }
      );
    },
    cell: ({ row }) => {
      var _a;
      const isSmallScreen = nr("(max-width: 768px)");
      return formatDate(((_a = row.original.updatedAt) == null ? void 0 : _a.toString()) ?? "", isSmallScreen);
    }
  },
  {
    accessorKey: "filterSource",
    header: ({ column }) => {
      const localize = useLocalize();
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        SortFilterHeader,
        {
          column,
          title: localize("com_ui_storage"),
          filters: {
            Storage: Object.values(Ze).filter(
              (value) => value === Ze.local || value === Ze.openai || value === Ze.azure
            )
          },
          valueMap: {
            [Ze.azure]: "com_ui_azure",
            [Ze.openai]: "com_ui_openai",
            [Ze.local]: "com_ui_host"
          }
        }
      );
    },
    cell: ({ row }) => {
      const localize = useLocalize();
      const { source } = row.original;
      if (source === Ze.openai) {
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(vn, { className: "icon-sm text-brand-blue-600/50" }),
          "OpenAI"
        ] });
      } else if (source === Ze.azure) {
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Cn, { className: "icon-sm text-cyan-700" }),
          "Azure"
        ] });
      }
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Database, { className: "icon-sm text-cyan-700" }),
        localize("com_ui_host")
      ] });
    }
  },
  {
    accessorKey: "context",
    header: ({ column }) => {
      const localize = useLocalize();
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        SortFilterHeader,
        {
          column,
          title: localize("com_ui_context"),
          filters: {
            Context: Object.values(Ft).filter(
              (value) => value === Ft[value ?? ""]
            )
          },
          valueMap: contextMap$1
        }
      );
    },
    cell: ({ row }) => {
      const { context } = row.original;
      const localize = useLocalize();
      return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap items-center gap-2", children: localize(contextMap$1[context ?? Ft.unknown]) });
    }
  },
  {
    accessorKey: "bytes",
    header: ({ column }) => {
      const localize = useLocalize();
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Rt,
        {
          variant: "ghost",
          className: "px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm",
          onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
          children: [
            localize("com_ui_size"),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowUpDown, { className: "ml-2 h-3 w-4 sm:h-4 sm:w-4" })
          ]
        }
      );
    },
    cell: ({ row }) => {
      const suffix = " MB";
      const value = Number((Number(row.original.bytes) / 1024 / 1024).toFixed(2));
      if (value < 0.01) {
        return "< 0.01 MB";
      }
      return `${value}${suffix}`;
    }
  }
];
const contextMap = {
  [Ft.filename]: "com_ui_name",
  [Ft.updatedAt]: "com_ui_date",
  [Ft.filterSource]: "com_ui_storage",
  [Ft.context]: "com_ui_context",
  [Ft.bytes]: "com_ui_size"
};
function DataTable({ columns: columns2, data }) {
  var _a;
  const localize = useLocalize();
  const [isDeleting, setIsDeleting] = reactExports.useState(false);
  const setFiles = Recoil_index_24(store.filesByIndex(0));
  const { deleteFiles } = useDeleteFilesFromTable(() => setIsDeleting(false));
  const [rowSelection, setRowSelection] = reactExports.useState({});
  const [sorting, setSorting] = reactExports.useState([]);
  const isSmallScreen = nr("(max-width: 768px)");
  const [columnFilters, setColumnFilters] = reactExports.useState([]);
  const [columnVisibility, setColumnVisibility] = reactExports.useState({});
  const table = useReactTable({
    data,
    columns: columns2,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    getPaginationRowModel: getPaginationRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2 py-2 sm:gap-4 sm:py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Rt,
        {
          variant: "outline",
          onClick: () => {
            setIsDeleting(true);
            const filesToDelete = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
            deleteFiles({ files: filesToDelete, setFiles });
            setRowSelection({});
          },
          disabled: !table.getFilteredSelectedRowModel().rows.length || isDeleting,
          className: cn("min-w-[40px] transition-all duration-200", isSmallScreen && "px-2 py-1"),
          children: [
            isDeleting ? /* @__PURE__ */ jsxRuntimeExports.jsx(Ea, { className: "size-3.5 sm:size-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(gn, { className: "size-3.5 text-red-400 sm:size-4" }),
            !isSmallScreen && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2", children: localize("com_ui_delete") })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        yr,
        {
          placeholder: localize("com_files_filter"),
          value: ((_a = table.getColumn("filename")) == null ? void 0 : _a.getFilterValue()) ?? "",
          onChange: (event) => {
            var _a2;
            return (_a2 = table.getColumn("filename")) == null ? void 0 : _a2.setFilterValue(event.target.value);
          },
          className: "flex-1 text-sm"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Ht, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Bt, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Rt, { variant: "outline", className: cn("min-w-[40px]", isSmallScreen && "px-2 py-1"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(ListFilter, { className: "size-3.5 sm:size-4" }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          jt,
          {
            align: "end",
            className: "max-h-[300px] overflow-y-auto dark:border-gray-700 dark:bg-gray-850",
            children: table.getAllColumns().filter((column) => column.getCanHide()).map((column) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              Pt,
              {
                className: "cursor-pointer text-sm capitalize dark:text-white dark:hover:bg-gray-800",
                checked: column.getIsVisible(),
                onCheckedChange: (value) => column.toggleVisibility(Boolean(value)),
                children: localize(contextMap[column.id])
              },
              column.id
            ))
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative grid h-full max-h-[calc(100vh-20rem)] w-full flex-1 overflow-hidden overflow-x-auto overflow-y-auto rounded-md border border-black/10 dark:border-white/10", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Ar, { className: "w-full min-w-[300px] border-separate border-spacing-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx($r, { className: "sticky top-0 z-50", children: table.getHeaderGroups().map((headerGroup) => /* @__PURE__ */ jsxRuntimeExports.jsx(_r, { className: "border-b border-border-light", children: headerGroup.headers.map((header, index) => {
        const style = {};
        if (index === 0 && header.id === "select") {
          style.width = "35px";
          style.minWidth = "35px";
        } else if (header.id === "filename") {
          style.width = isSmallScreen ? "60%" : "40%";
        } else {
          style.width = isSmallScreen ? "20%" : "15%";
        }
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          Gr,
          {
            className: "whitespace-nowrap bg-surface-secondary px-2 py-2 text-left text-sm font-medium text-text-secondary sm:px-4",
            style: { ...style },
            children: header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())
          },
          header.id
        );
      }) }, headerGroup.id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Fr, { className: "w-full", children: table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        _r,
        {
          "data-state": row.getIsSelected() && "selected",
          className: "border-b border-border-light transition-colors hover:bg-surface-secondary [tr:last-child_&]:border-b-0",
          children: row.getVisibleCells().map((cell, index) => {
            var _a2;
            const maxWidth = ((_a2 = cell.column.columnDef.meta) == null ? void 0 : _a2.size) ?? "auto";
            const style = {};
            if (cell.column.id === "filename") {
              style.maxWidth = maxWidth;
            } else if (index === 0) {
              style.maxWidth = "20px";
            }
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              qr,
              {
                className: "align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50",
                style,
                children: flexRender(cell.column.columnDef.cell, cell.getContext())
              },
              cell.id
            );
          })
        },
        row.id
      )) : /* @__PURE__ */ jsxRuntimeExports.jsx(_r, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(qr, { colSpan: columns2.length, className: "h-24 text-center", children: localize("com_files_no_results") }) }) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-2 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-2 flex-1 truncate text-xs text-muted-foreground sm:ml-4 sm:text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden sm:inline", children: localize("com_files_number_selected", {
          0: `${table.getFilteredSelectedRowModel().rows.length}`,
          1: `${table.getFilteredRowModel().rows.length}`
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sm:hidden", children: `${table.getFilteredSelectedRowModel().rows.length}/${table.getFilteredRowModel().rows.length}` })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center space-x-1 pr-2 text-xs font-bold text-text-primary sm:text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden sm:inline", children: localize("com_ui_page") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: table.getState().pagination.pageIndex + 1 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "/" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: table.getPageCount() })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Rt,
        {
          className: "select-none",
          variant: "outline",
          size: "sm",
          onClick: () => table.previousPage(),
          disabled: !table.getCanPreviousPage(),
          children: localize("com_ui_prev")
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Rt,
        {
          className: "select-none",
          variant: "outline",
          size: "sm",
          onClick: () => table.nextPage(),
          disabled: !table.getCanNextPage(),
          children: localize("com_ui_next")
        }
      )
    ] })
  ] });
}
[
  {
    _id: "65b004acd70ce86b9146e9dd",
    file_id: "file-CbxzlOiGvaG2uwhuAdKXdUpX",
    __v: 0,
    bytes: 18740,
    createdAt: "2024-01-23T18:25:48.153Z",
    filename: "dataset.xlsx",
    filepath: "https://api.openai.com/v1/files/file-CbxzlOiGvaG2uwhuAdKXdUpX",
    object: "file",
    source: Ze.openai,
    temp_file_id: "63214c34-2d2c-445f-9c60-5cf04c15607c",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    updatedAt: "2024-01-23T18:25:48.153Z",
    usage: 0,
    user: "652ac880c4102a77fe54c5db",
    embedded: false
  },
  {
    _id: "65b004abd70ce86b9146e861",
    file_id: "86fe0534-803c-4e88-b730-73ec4187742f",
    __v: 0,
    bytes: 3147861,
    createdAt: "2024-01-23T18:25:47.698Z",
    filename: "img-337c49c7-fb1f-4a14-939d-40d12de11d5c.png",
    filepath: "/images/652ac880c4102a77fe54c5db/img-337c49c7-fb1f-4a14-939d-40d12de11d5c.png",
    height: 1024,
    object: "file",
    source: Ze.local,
    type: "image/png",
    updatedAt: "2024-01-23T18:25:47.698Z",
    usage: 0,
    user: "652ac880c4102a77fe54c5db",
    width: 1024,
    embedded: false
  },
  {
    _id: "65b00495d70ce86b9146adc1",
    file_id: "e301fdff-6fae-48d3-a9a2-c7fe66357890",
    __v: 0,
    bytes: 3147861,
    createdAt: "2024-01-23T18:25:25.324Z",
    filename: "img-459c76d1-16b7-48f9-9ff7-85ba6464e204.png",
    filepath: "/images/652ac880c4102a77fe54c5db/img-459c76d1-16b7-48f9-9ff7-85ba6464e204.png",
    height: 1024,
    object: "file",
    source: Ze.local,
    type: "image/png",
    updatedAt: "2024-01-23T18:25:25.324Z",
    usage: 0,
    user: "652ac880c4102a77fe54c5db",
    width: 1024,
    embedded: false
  },
  {
    _id: "65b00494d70ce86b9146ace6",
    file_id: "63cf2058-3ad1-4712-afbe-6b475119c33a",
    __v: 0,
    bytes: 3147861,
    createdAt: "2024-01-23T18:25:25.035Z",
    filename: "img-c3fb2935-e578-4d72-b397-d1dcb122af67.png",
    filepath: "/images/652ac880c4102a77fe54c5db/img-c3fb2935-e578-4d72-b397-d1dcb122af67.png",
    height: 1024,
    object: "file",
    source: Ze.local,
    type: "image/png",
    updatedAt: "2024-01-23T18:25:25.035Z",
    usage: 0,
    user: "652ac880c4102a77fe54c5db",
    width: 1024,
    embedded: false
  }
];
function Files({ open, onOpenChange }) {
  const localize = useLocalize();
  const { data: files = [] } = useGetFiles({
    select: (files2) => files2.map((file) => {
      file.context = file.context ?? Ft.unknown;
      file.filterSource = file.source === Ze.firebase ? Ze.local : file.source;
      return file;
    })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Lr, { open, onOpenChange, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Vr,
    {
      title: localize("com_nav_my_files"),
      className: "w-11/12 bg-background text-text-primary shadow-2xl",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Hr, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Br, { children: localize("com_nav_my_files") }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DataTable, { columns, data: files })
      ]
    }
  ) });
}
function AccountSettings() {
  var _a, _b, _c, _d;
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && ((_a = startupConfig == null ? void 0 : startupConfig.balance) == null ? void 0 : _a.enabled)
  });
  const [showSettings, setShowSettings] = reactExports.useState(false);
  const [showFiles, setShowFiles] = Recoil_index_22(store.showFiles);
  const privacyPolicy = (_b = startupConfig == null ? void 0 : startupConfig.interface) == null ? void 0 : _b.privacyPolicy;
  const termsOfService = (_c = startupConfig == null ? void 0 : startupConfig.interface) == null ? void 0 : _c.termsOfService;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectProvider, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Select,
      {
        "aria-label": localize("com_nav_account_settings"),
        "data-testid": "nav-user",
        className: "mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-hover",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative flex", children: /* @__PURE__ */ jsxRuntimeExports.jsx(no, { user, size: 32 }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary",
              style: { marginTop: "0", marginLeft: "0" },
              children: (user == null ? void 0 : user.name) ?? (user == null ? void 0 : user.username) ?? localize("com_nav_user")
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      SelectPopover,
      {
        className: "popover-ui w-[235px]",
        style: {
          transformOrigin: "bottom",
          marginRight: "0px",
          translate: "0px"
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-token-text-secondary ml-3 mr-2 py-2 text-sm", role: "note", children: (user == null ? void 0 : user.email) ?? localize("com_nav_user") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(At, {}),
          ((_d = startupConfig == null ? void 0 : startupConfig.balance) == null ? void 0 : _d.enabled) === true && balanceQuery.data != null && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-token-text-secondary ml-3 mr-2 py-2 text-sm", role: "note", children: [
              localize("com_nav_balance"),
              ":",
              " ",
              new Intl.NumberFormat().format(Math.round(balanceQuery.data.tokenCredits))
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(At, {})
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            SelectItem,
            {
              value: "",
              onClick: () => setShowFiles(true),
              className: "select-item text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "icon-md", "aria-hidden": "true" }),
                localize("com_nav_my_files")
              ]
            }
          ),
          (startupConfig == null ? void 0 : startupConfig.helpAndFaqURL) !== "/" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            SelectItem,
            {
              value: "",
              onClick: () => window.open(startupConfig == null ? void 0 : startupConfig.helpAndFaqURL, "_blank"),
              className: "select-item text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(mn, { "aria-hidden": "true" }),
                localize("com_nav_help_faq")
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            SelectItem,
            {
              value: "",
              onClick: () => setShowSettings(true),
              className: "select-item text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(pn, { className: "icon-md", "aria-hidden": "true" }),
                localize("com_nav_settings")
              ]
            }
          ),
          (privacyPolicy == null ? void 0 : privacyPolicy.externalUrl) != null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            SelectItem,
            {
              value: "",
              onClick: () => window.open(
                privacyPolicy.externalUrl,
                privacyPolicy.openNewTab === true ? "_blank" : "_self"
              ),
              className: "select-item text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(mn, { "aria-hidden": "true" }),
                localize("com_ui_privacy_policy")
              ]
            }
          ),
          (termsOfService == null ? void 0 : termsOfService.externalUrl) != null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            SelectItem,
            {
              value: "",
              onClick: () => window.open(
                termsOfService.externalUrl,
                termsOfService.openNewTab === true ? "_blank" : "_self"
              ),
              className: "select-item text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(mn, { "aria-hidden": "true" }),
                localize("com_ui_terms_of_service")
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(At, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            SelectItem,
            {
              "aria-selected": true,
              onClick: () => logout(),
              value: "logout",
              className: "select-item text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(LogOut, { className: "icon-md" }),
                localize("com_nav_log_out")
              ]
            }
          )
        ]
      }
    ),
    showFiles && /* @__PURE__ */ jsxRuntimeExports.jsx(Files, { open: showFiles, onOpenChange: setShowFiles }),
    showSettings && /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { open: showSettings, onOpenChange: setShowSettings })
  ] });
}
const AccountSettings$1 = reactExports.memo(AccountSettings);
export {
  AccountSettings$1 as default
};
