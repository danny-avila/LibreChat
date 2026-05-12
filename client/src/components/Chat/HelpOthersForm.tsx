import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight } from 'lucide-react';
import { Input, Button, Textarea } from '~/components/ui';
import { useSubmitMessage } from '~/hooks';

interface HelpOthersFormData {
  studentName: string;
  studentGrade: string;
  studentInfo: string;
}

const guidanceItems = [
  "What behaviors you've observed and what you know about their home situation or circumstances",
  'What they enjoy or gravitate toward — art, music, sports, gaming, drawing, anything that seems to light them up',
  "Your relationship with this student and any moments of connection you've noticed",
  'Any relevant context — family situation, language, cultural background, economic stress',
];

const buildMessage = ({ studentName, studentGrade, studentInfo }: HelpOthersFormData) => {
  const name = studentName.trim();
  const grade = studentGrade.trim();
  const info = studentInfo.trim();

  let prefix = '';
  if (name && grade) prefix = `${name} is in ${grade}. `;
  else if (name) prefix = `The student's name is ${name}. `;
  else if (grade) prefix = `The student is in ${grade}. `;

  return prefix + info;
};

export default function HelpOthersForm() {
  const { register, handleSubmit, setFocus, getValues } = useForm<HelpOthersFormData>({
    defaultValues: { studentName: '', studentGrade: '', studentInfo: '' },
  });
  const { submitMessage } = useSubmitMessage();
  const [textareaError, setTextareaError] = useState(false);

  const onSubmit = (data: HelpOthersFormData) => {
    if (!data.studentGrade.trim() && !data.studentInfo.trim()) {
      setTextareaError(true);
      setFocus('studentInfo');
      setTimeout(() => setTextareaError(false), 2000);
      return;
    }
    submitMessage({ text: buildMessage(data) });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-6 w-full max-w-xl rounded-2xl border border-border-light bg-surface-primary p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="help-others-student-name"
            className="text-xs font-medium uppercase tracking-wide text-text-secondary"
          >
            Student name <span className="font-normal normal-case tracking-normal text-text-tertiary">(optional)</span>
          </label>
          <Input
            id="help-others-student-name"
            type="text"
            placeholder="e.g. Mary"
            autoComplete="off"
            className="bg-surface-secondary text-text-primary"
            {...register('studentName')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="help-others-student-grade"
            className="text-xs font-medium uppercase tracking-wide text-text-secondary"
          >
            Age or grade level
          </label>
          <Input
            id="help-others-student-grade"
            type="text"
            placeholder="e.g. 8th grade, age 14"
            autoComplete="off"
            className="bg-surface-secondary text-text-primary"
            {...register('studentGrade')}
          />
        </div>
      </div>

      <div className="my-5 border-t border-border-light" />

      <label
        htmlFor="help-others-student-info"
        className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary"
      >
        Tell us about this student
      </label>

      <div className="mb-3 rounded-md border-l-2 border-surface-submit bg-surface-secondary px-3.5 py-3">
        <div className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-text-secondary">
          Consider sharing
        </div>
        <ul className="flex flex-col gap-1.5">
          {guidanceItems.map((item, i) => (
            <li
              key={i}
              className="relative pl-3.5 text-[0.82rem] leading-relaxed text-text-secondary before:absolute before:left-0 before:top-[0.55rem] before:h-1 before:w-1 before:rounded-full before:bg-current before:opacity-60"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      <Textarea
        id="help-others-student-info"
        rows={5}
        placeholder="e.g. She's in my 8th grade math class. She comes from a difficult home situation and has been getting more withdrawn and disruptive over the semester. She used to doodle constantly in class..."
        className={`min-h-[130px] bg-surface-secondary text-text-primary transition-colors ${textareaError ? 'border-red-500 dark:border-red-500' : ''}`}
        {...register('studentInfo')}
      />

      <div className="mt-5 flex flex-col items-end gap-3 border-t border-border-light pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[14rem] text-xs leading-snug text-text-tertiary">
          The more you share, the more personalized the support will be.
        </p>
        <Button type="submit" variant="submit" className="gap-2">
          Get started
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
