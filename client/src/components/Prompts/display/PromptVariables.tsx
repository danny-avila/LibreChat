import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Variable } from 'lucide-react';
import { specialVariables } from 'librechat-data-provider';
import { cn, extractUniqueVariables } from '~/utils';
import { useLocalize } from '~/hooks';

const specialVariableClasses =
  'bg-amber-100/80 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400';

interface ParsedVariable {
  name: string;
  options: string[];
  isDropdown: boolean;
  isSpecial: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

const optionContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
};

const optionVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
};

const parseVariable = (variable: string): ParsedVariable => {
  const isSpecial = specialVariables[variable.toLowerCase()] != null;
  if (isSpecial) {
    return { name: variable.toLowerCase(), options: [], isDropdown: false, isSpecial: true };
  }

  const colonIndex = variable.indexOf(':');
  if (colonIndex > 0) {
    const name = variable.substring(0, colonIndex);
    const optionsPart = variable.substring(colonIndex + 1);
    const options = optionsPart.split('|').filter(Boolean);
    if (options.length > 1) {
      return { name, options, isDropdown: true, isSpecial: false };
    }
  }

  return { name: variable, options: [], isDropdown: false, isSpecial: false };
};

const DropdownVariableCard = ({ parsed }: { parsed: ParsedVariable }) => {
  const localize = useLocalize();

  return (
    <motion.div
      variants={itemVariants}
      className="bg-surface-tertiary/50 rounded-lg border border-border-light p-2.5"
      role="listitem"
      aria-label={localize('com_ui_variable_with_options', {
        name: parsed.name,
        count: parsed.options.length,
      })}
    >
      <div className="mb-2 text-xs font-semibold text-text-primary">{parsed.name}</div>
      <motion.div
        className="flex flex-wrap gap-1.5"
        variants={optionContainerVariants}
        initial="hidden"
        animate="visible"
        role="list"
        aria-label={localize('com_ui_available_options')}
      >
        {parsed.options.map((option, index) => (
          <motion.span
            key={index}
            variants={optionVariants}
            className="rounded-md bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary"
            role="listitem"
          >
            {option}
          </motion.span>
        ))}
      </motion.div>
    </motion.div>
  );
};

const SimpleVariableChip = ({ parsed }: { parsed: ParsedVariable }) => (
  <motion.span
    variants={itemVariants}
    className={cn(
      'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium',
      parsed.isSpecial ? specialVariableClasses : 'bg-surface-tertiary text-text-primary',
    )}
    role="listitem"
  >
    <span className="max-w-32 truncate">{parsed.name}</span>
  </motion.span>
);

const PromptVariables = ({ promptText }: { promptText: string }) => {
  const localize = useLocalize();

  const variables = useMemo(() => {
    return extractUniqueVariables(promptText || '');
  }, [promptText]);

  const parsedVariables = useMemo(() => {
    return variables.map(parseVariable);
  }, [variables]);

  const dropdownVariables = parsedVariables.filter((v) => v.isDropdown);
  const simpleVariables = parsedVariables.filter((v) => !v.isDropdown);

  if (variables.length === 0) {
    return null;
  }

  return (
    <div className="bg-surface-secondary/50 rounded-lg border border-border-light">
      <div className="flex items-center gap-2 px-3 py-2">
        <Variable className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        <span className="text-sm font-medium text-text-primary">
          {localize('com_ui_variables')}
        </span>
        <span className="rounded-full bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-secondary">
          {variables.length}
        </span>
      </div>

      <motion.div
        className="flex flex-col gap-3 border-t border-border-light px-3 py-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        role="list"
        aria-label={localize('com_ui_prompt_variables_list')}
      >
        {dropdownVariables.length > 0 && (
          <div className="flex flex-col gap-2">
            {dropdownVariables.map((parsed, index) => (
              <DropdownVariableCard key={`dropdown-${index}`} parsed={parsed} />
            ))}
          </div>
        )}

        {simpleVariables.length > 0 && (
          <motion.div className="flex flex-wrap gap-1.5" variants={itemVariants}>
            {simpleVariables.map((parsed, index) => (
              <SimpleVariableChip key={`simple-${index}`} parsed={parsed} />
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default PromptVariables;
