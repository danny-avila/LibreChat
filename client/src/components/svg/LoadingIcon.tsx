export default function LoadingIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{
        margin: 'auto',
        background: 'rgba(255, 255, 255, 0)',
        display: 'block',
        shapeRendering: 'auto',
      }}
      width="30px"
      height="30px"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid"
    >
      <path d="M8 50A42 42 0 0 0 92 50A42 44 0 0 1 8 50" fill="#ffffff" stroke="none">
        <animateTransform
          attributeName="transform"
          type="rotate"
          dur="1s"
          repeatCount="indefinite"
          keyTimes="0;1"
          values="0 50 51;360 50 51"
        ></animateTransform>
      </path>
    </svg>
  );
}
