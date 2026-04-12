import type { TSkill } from 'librechat-data-provider';
import SkillDetailHeader from './SkillDetailHeader';

interface SkillDetailProps {
  skill: TSkill;
}

const SkillDetail = ({ skill }: SkillDetailProps) => {
  return (
    <article
      className="flex min-w-0 flex-col gap-3 overflow-y-auto p-1 sm:gap-4 sm:p-2"
      aria-label={skill.name}
    >
      <h1 className="sr-only">{skill.name}</h1>
      <SkillDetailHeader skill={skill} />
    </article>
  );
};

export default SkillDetail;
