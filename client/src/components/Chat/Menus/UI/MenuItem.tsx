import type { FC } from 'react';
import { cn } from '~/utils';

type MenuItemProps = {
  title: string;
  value?: string;
  selected: boolean;
  description?: string;
  onClick?: () => void;
  hoverCondition?: boolean;
  hoverContent?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  textClassName?: string;
  disableHover?: boolean;
  // hoverContent?: string;
};

const MenuItem: FC<MenuItemProps> = ({
  title,
  // value,
  description,
  selected,
  // hoverCondition = true,
  // hoverContent,
  icon,
  className = '',
  textClassName = '',
  disableHover = false,
  children,
  onClick,
}) => {
  return (
    <div
      role="menuitem"
      className={cn(
        'group m-1.5 flex cursor-pointer gap-2 rounded px-5 py-2.5 !pr-3 text-sm !opacity-100 hover:bg-black/5 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-white/5 md:min-w-[240px]',
        className ?? '',
      )}
      tabIndex={-1}
      onClick={onClick}
    >
      <div className="flex grow items-center justify-between gap-2">
        <div>
          <div className={cn('flex items-center gap-1 ')}>
            {icon && icon}
            {/* <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon-md shrink-0">
              <path d="M19.3975 1.35498C19.3746 1.15293 19.2037 1.00021 19.0004 1C18.7971 0.999793 18.6259 1.15217 18.6026 1.35417C18.4798 2.41894 18.1627 3.15692 17.6598 3.65983C17.1569 4.16274 16.4189 4.47983 15.3542 4.60264C15.1522 4.62593 14.9998 4.79707 15 5.00041C15.0002 5.20375 15.1529 5.37457 15.355 5.39746C16.4019 5.51605 17.1562 5.83304 17.6716 6.33906C18.1845 6.84269 18.5078 7.57998 18.6016 8.63539C18.6199 8.84195 18.7931 9.00023 19.0005 9C19.2078 8.99977 19.3806 8.84109 19.3985 8.6345C19.4883 7.59673 19.8114 6.84328 20.3273 6.32735C20.8433 5.81142 21.5967 5.48834 22.6345 5.39851C22.8411 5.38063 22.9998 5.20782 23 5.00045C23.0002 4.79308 22.842 4.61992 22.6354 4.60157C21.58 4.50782 20.8427 4.18447 20.3391 3.67157C19.833 3.15623 19.516 2.40192 19.3975 1.35498Z" fill="currentColor"/>
              <path fillRule="evenodd" clipRule="evenodd" d="M11 3C11.4833 3 11.8974 3.34562 11.9839 3.82111C12.4637 6.46043 13.279 8.23983 14.5196 9.48039C15.7602 10.721 17.5396 11.5363 20.1789 12.0161C20.6544 12.1026 21 12.5167 21 13C21 13.4833 20.6544 13.8974 20.1789 13.9839C17.5396 14.4637 15.7602 15.279 14.5196 16.5196C13.279 17.7602 12.4637 19.5396 11.9839 22.1789C11.8974 22.6544 11.4833 23 11 23C10.5167 23 10.1026 22.6544 10.0161 22.1789C9.53625 19.5396 8.72096 17.7602 7.48039 16.5196C6.23983 15.279 4.46043 14.4637 1.82111 13.9839C1.34562 13.8974 1 13.4833 1 13C1 12.5167 1.34562 12.1026 1.82111 12.0161C4.46043 11.5363 6.23983 10.721 7.48039 9.48039C8.72096 8.23983 9.53625 6.46043 10.0161 3.82111C10.1026 3.34562 10.5167 3 11 3ZM5.66618 13C6.9247 13.5226 7.99788 14.2087 8.89461 15.1054C9.79134 16.0021 10.4774 17.0753 11 18.3338C11.5226 17.0753 12.2087 16.0021 13.1054 15.1054C14.0021 14.2087 15.0753 13.5226 16.3338 13C15.0753 12.4774 14.0021 11.7913 13.1054 10.8946C12.2087 9.99788 11.5226 8.9247 11 7.66618C10.4774 8.9247 9.79134 9.99788 8.89461 10.8946C7.99788 11.7913 6.9247 12.4774 5.66618 13Z" fill="currentColor"/>
            </svg> */}
            <div className={cn('truncate', textClassName)}>
              {title}
              <div className="text-token-text-tertiary">{description}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children}
          {selected && (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="icon-md block "
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
                fill="currentColor"
              />
            </svg>
          )}
          {!selected && !disableHover && (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="icon-md invisible block gap-x-1 group-hover:visible group-hover:flex"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
                fill="currentColor"
              />
            </svg>
          )}
          {/* {(hoverCondition && hoverContent) && (
            hoverContent
            // <div className="text-token-text-primary hidden gap-x-1 group-hover:flex ">
            //   <div className="">New Chat</div>
            //   <svg
            //     width="24"
            //     height="24"
            //     viewBox="0 0 24 24"
            //     fill="none"
            //     xmlns="http://www.w3.org/2000/svg"
            //     className="icon-sm"
            //   >
            //     <path
            //       fillRule="evenodd"
            //       clipRule="evenodd"
            //       d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z"
            //       fill="currentColor"
            //     />
            //   </svg>
            // </div>
          )
          } */}
        </div>
      </div>
    </div>
  );
};

export default MenuItem;
