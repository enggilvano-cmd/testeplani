import { createContext, useContext, useState, ReactNode } from 'react';

interface BybitContextType {
  // Add Bybit-specific state and methods here
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const BybitContext = createContext<BybitContextType | undefined>(undefined);

export const BybitProvider = ({ children }: { children: ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false);

  const connect = () => {
    setIsConnected(true);
  };

  const disconnect = () => {
    setIsConnected(false);
  };

  return (
    <BybitContext.Provider value={{ isConnected, connect, disconnect }}>
      {children}
    </BybitContext.Provider>
  );
};

export const useBybit = () => {
  const context = useContext(BybitContext);
  if (context === undefined) {
    throw new Error('useBybit must be used within a BybitProvider');
  }
  return context;
};
