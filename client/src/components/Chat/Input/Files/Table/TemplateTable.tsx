import { DotsIcon, TrashIcon } from '@librechat/client';

export default function Template() {
  return (
    <div className="max-h-[28rem] overflow-y-auto rounded-md border border-border-light">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky top-0 rounded-t border-b border-border-light bg-surface-primary px-4 py-2 text-left font-medium text-text-primary">
              Name
            </th>
            <th className="sticky top-0 rounded-t border-b border-border-light bg-surface-primary px-4 py-2 text-left font-medium text-text-primary">
              Date
            </th>
            <th className="sticky top-0 rounded-t border-b border-border-light bg-surface-primary px-4 py-2 text-left font-medium text-text-primary">
              Size
            </th>
            <th className="sticky top-0 rounded-t border-b border-border-light bg-surface-primary px-4 py-2 text-right font-medium text-text-primary">
              <button
                className="text-text-secondary hover:text-text-primary radix-state-open:text-text-primary"
                type="button"
                id="radix-:r67:"
                aria-haspopup="menu"
                aria-expanded="false"
                data-state="closed"
              >
                <DotsIcon />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="">
            <td className="border-b border-border-light text-left text-text-secondary [tr:last-child_&]:border-b-0">
              <div className="px-4 py-2 [tr[data-disabled=true]_&]:opacity-50">
                File Transfer: Node to FastAPI
              </div>
            </td>
            <td className="border-b border-border-light text-left text-text-secondary [tr:last-child_&]:border-b-0">
              <div className="px-4 py-2 [tr[data-disabled=true]_&]:opacity-50">June 11, 2023</div>
            </td>
            <td className="border-b border-border-light text-left text-text-secondary [tr:last-child_&]:border-b-0">
              <div className="px-4 py-2 [tr[data-disabled=true]_&]:opacity-50">11 mb</div>
            </td>
            <td className="border-b border-border-light text-left text-text-secondary [tr:last-child_&]:border-b-0">
              <div className="px-4 py-2 [tr[data-disabled=true]_&]:opacity-50">
                <div className="flex items-center justify-end gap-2">
                  <span className="" data-state="closed">
                    <a
                      href="/c/da3130ea-830c-4dd2-9d2d-d875e71e3867"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View source chat"
                      className="text-text-secondary hover:text-text-primary"
                    >
                      <svg
                        stroke="currentColor"
                        fill="none"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        height="1em"
                        width="1em"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </a>
                  </span>
                  <span className="" data-state="closed">
                    <button
                      aria-label="Delete shared link"
                      className="text-text-secondary hover:text-text-primary"
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
