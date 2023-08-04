import EndpointItem from './EndpointItem';

export default function EndpointItems({ endpoints, onSelect, selectedEndpoint }) {
  return (
    <>
      {endpoints.map((endpoint) => (
        <EndpointItem
          isSelected={selectedEndpoint === endpoint}
          key={endpoint}
          value={endpoint}
          onSelect={onSelect}
          endpoint={endpoint}
        />
      ))}
    </>
  );
}
