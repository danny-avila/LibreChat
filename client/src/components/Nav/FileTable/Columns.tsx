import { ColumnDef } from "@tanstack/react-table"
import { File } from '~/data-provider';
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "~/components/ui/"

export const columns: ColumnDef<File>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "date",
    header: "Date",
  },
  {
    accessorKey: "size",
    header: "Size",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const file = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[1001]">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(file.id)}
            >
              Copy file ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Delete File</DropdownMenuItem>
            {/* <DropdownMenuItem>View details</DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  }
]
