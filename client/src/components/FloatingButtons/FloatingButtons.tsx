
import { useGetBannerQuery, useGetStartupConfig } from '~/data-provider';
import './FloatingButtons.css';

export const FloatingButtons = ({}: {}) => {
  const { data: startupConfig } = useGetStartupConfig();

    if (!startupConfig?.floatingButtons?.length) {
      return null;
    }

  return <nav className="floating-buttons">
    {startupConfig.floatingButtons.map((button, index) => (
      <a
        key={index}
        href={button.url}
        target={button.newTab ? '_blank' : '_self'  }
        rel="noopener noreferrer"
        data-label={button.label}
        className="floating-buttons_button"
      >
        {button.icon && (
            <i className="floating-buttons_icon" dangerouslySetInnerHTML={{ __html: button.icon }} />
        )}
        {/* {button.label && (
            <span className="floating-buttons_label">{button.label}</span>
        )} */}
      </a>
    ))}
  </nav>;
};
