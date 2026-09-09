import { useState } from 'react';

interface AddRootFormProps {
  readonly onAdd: (name: string) => Promise<string | null>;
}

export function AddRootForm({ onAdd }: AddRootFormProps) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      className="delivery-add-root"
      onSubmit={(event) => {
        event.preventDefault();
        void onAdd(name).then((failure) => {
          setProblem(failure);
          if (failure === null) {
            setName('');
          }
        });
      }}
    >
      <label className="bl-visually-hidden" htmlFor="new-root">
        Name of a new top-level work package
      </label>
      <input
        id="new-root"
        className="delivery-node-input"
        value={name}
        placeholder="New top-level work package"
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <button type="submit">Add</button>

      {problem !== null && (
        <span className="delivery-node-problem" role="alert">
          {problem}
        </span>
      )}
    </form>
  );
}
