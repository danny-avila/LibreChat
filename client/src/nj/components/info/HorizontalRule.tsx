interface HorizontalRuleProps {
  spacing: string;
}

export function HorizontalRule({ spacing }: HorizontalRuleProps) {
  return <hr className={`border-2-border-light border" aria-hidden="true" ${spacing}`} />;
}
