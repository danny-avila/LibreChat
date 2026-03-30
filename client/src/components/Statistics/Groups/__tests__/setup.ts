// Test setup for Group Statistics components
import '@testing-library/jest-dom';

// Mock React Router
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));

// Mock utility functions
jest.mock('~/utils', () => ({
  formatNumber: (num: number) => num?.toLocaleString() || '0',
  formatCurrency: (num: number) => `$${num?.toFixed(2) || '0.00'}`,
  formatRelativeTime: (date: string) => '2 hours ago',
  formatPercentage: (num: number) => `${(num * 100).toFixed(1)}%`,
}));

// Mock LibreChat UI components
jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, variant, size, className, disabled }: any) => (
    <button 
      onClick={onClick} 
      className={`${variant || ''} ${size || ''} ${className || ''}`}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  ),
  Input: ({ value, onChange, type, min, placeholder, className, ...props }: any) => (
    <input
      value={value || ''}
      onChange={onChange}
      type={type || 'text'}
      min={min}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  ),
  Select: ({ value, onChange, className, children }: any) => (
    <select value={value} onChange={onChange} className={className}>
      {children}
    </select>
  ),
  Spinner: ({ className }: any) => (
    <div className={`spinner ${className || ''}`} role="status">Loading...</div>
  ),
}));

// Mock Lucide React icons
jest.mock('lucide-react', () => {
  const MockIcon = ({ className, ...props }: any) => (
    <span className={`icon ${className || ''}`} {...props} />
  );
  
  return {
    ChevronUp: MockIcon,
    ChevronDown: MockIcon,
    Crown: MockIcon,
    Medal: MockIcon,
    Award: MockIcon,
    Users: MockIcon,
    TrendingUp: MockIcon,
    AlertTriangle: MockIcon,
    Clock: MockIcon,
    Calendar: MockIcon,
    Filter: MockIcon,
    X: MockIcon,
    Activity: MockIcon,
    ArrowLeft: MockIcon,
    DollarSign: MockIcon,
    BarChart: MockIcon,
    PieChart: MockIcon,
    Zap: MockIcon,
  };
});

// Global fetch mock
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Console mocks to reduce noise in tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

export { mockFetch };