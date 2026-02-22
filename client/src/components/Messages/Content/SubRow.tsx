type TSubRowProps = {
  children: React.ReactNode;
  classes?: string;
  subclasses?: string;
  onClick?: () => void;
};

export default function SubRow({ children, classes = '', subclasses = '', onClick }: TSubRowProps) {
  return (
    <div className={`flex justify-between ${classes}`} onClick={onClick}>
      <div
        className={`flex items-center justify-center gap-1 self-center pt-2 text-xs ${subclasses}`}
      >
        {children}
      </div>
    </div>
  );
}
