export const BlinkAnimation = ({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) => {
  const style = `
  @keyframes blink-animation {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }`;

  if (!active) {
    return <>{children}</>;
  }

  return (
    <>
      <style>{style}</style>
      <div style={{ animation: 'blink-animation 3s infinite' }}>{children}</div>
    </>
  );
};
