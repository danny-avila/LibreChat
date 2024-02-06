export default function complexSelectors(selectors: Array<string>, pluginOptions: {
    onComplexSelector?: 'warning';
}, warnOnComplexSelector: () => void, warnOnPseudoElements: () => void): string[];
