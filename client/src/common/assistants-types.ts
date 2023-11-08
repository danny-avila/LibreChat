export type Actions = {
  function: boolean;
  code_interpreter: boolean;
  retrieval: boolean;
};

export type CreationForm = {
  id: string;
  name: string | null;
  description: string | null;
  instructions: string | null;
  model: string;
} & Actions;
