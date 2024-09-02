export const name = 'RadioGroup';

export const importDocs = `
import { Label } from "/components/ui/label"
import { RadioGroup, RadioGroupItem } from "/components/ui/radio-group"
`;

export const usageDocs = `
<RadioGroup defaultValue="option-one">
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option-one" id="option-one" />
    <Label htmlFor="option-one">Option One</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option-two" id="option-two" />
    <Label htmlFor="option-two">Option Two</Label>
  </div>
</RadioGroup>
`;
