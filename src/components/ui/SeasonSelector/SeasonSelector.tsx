import { useAsyncData } from '@/hooks/useAsyncData';
import type { Season } from '@shared/types';
import './SeasonSelector.css';

interface SeasonSelectorProps {
  value: string;
  onChange: (seasonName: string) => void;
  className?: string;
}

export default function SeasonSelector({ value, onChange, className }: SeasonSelectorProps) {
  const { data: seasons } = useAsyncData<Season[]>('seasons-list');

  const sorted = seasons ? [...seasons].sort((a, b) => b.name.localeCompare(a.name)) : null;

  return (
    <select
      id="season-selector"
      name="season-selector"
      className={`season-selector${className ? ` ${className}` : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {sorted ? (
        <>
          <option value="overall">Overall</option>
          {sorted.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name} Season
            </option>
          ))}
        </>
      ) : (
        <option value={value}>{value === 'overall' ? 'Overall' : `${value} Season`}</option>
      )}
    </select>
  );
}
