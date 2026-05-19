/**
 * Formata custo em USD para relatórios.
 * Valores muito baixos (ex.: Grok) precisam de mais casas que o arredondamento a 2 centavos.
 */
export function formatReportCost(cost: number | null | undefined): string {
  if (cost === undefined || cost === null) {
    return 'N/A';
  }

  const abs = Math.abs(cost);
  let maximumFractionDigits = 2;
  if (abs > 0 && abs < 0.01) {
    maximumFractionDigits = 6;
  } else if (abs < 1) {
    maximumFractionDigits = 4;
  }

  return `$${cost.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })}`;
}
