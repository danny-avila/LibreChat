import EndpointItem from './EndpointItem';

interface EndpointItemsProps {
  endpoints: string[];
  onSelect: (endpoint: string) => void;
  selectedEndpoint: string;
}

export default function EndpointItems({ endpoints, selectedEndpoint }: EndpointItemsProps) {
  return (
    <>
      {endpoints.map((endpoint) => (
        <EndpointItem
          isSelected={selectedEndpoint === endpoint}
          key={endpoint}
          value={endpoint}
          endpoint={endpoint}
        />
      ))}
    </>
  );
}
