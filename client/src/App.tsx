import { useState } from 'react';
import { networkManager } from './network/NetworkManager';
import { useGameStore } from './store/gameStore';
import GameCanvas from './components/GameCanvas';
import './App.css';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  
  const setRoom = useGameStore(state => state.setRoom);
  
  const handleJoin = async () => {
    if (!username.trim()) {
      setError('Bitte gib einen Benutzernamen ein');
      return;
    }
    
    setIsConnecting(true);
    setError('');
    
    try {
      const room = await networkManager.joinOrCreate('game', { username });
      setRoom(room);
      setIsConnected(true);
      
      // Listen to messages
      room.onMessage('error', (message) => {
        console.error('Server error:', message);
        alert(`Fehler: ${message.message}`);
      });
      
      room.onMessage('buildingCompleted', (data) => {
        console.log('Building completed:', data);
      });
      
      room.onMessage('tradeCompleted', (data) => {
        console.log('Trade completed:', data);
      });
      
    } catch (err) {
      console.error('Connection failed:', err);
      setError('Verbindung fehlgeschlagen. Ist der Server gestartet?');
    } finally {
      setIsConnecting(false);
    }
  };
  
  if (!isConnected) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1>🏰 Hex Kingdom</h1>
          <p className="subtitle">Medieval Fantasy Strategy Game</p>
          
          <div className="login-form">
            <input
              type="text"
              placeholder="Benutzername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
              disabled={isConnecting}
            />
            
            <button 
              onClick={handleJoin}
              disabled={isConnecting}
              className="join-btn"
            >
              {isConnecting ? 'Verbinde...' : 'Spiel beitreten'}
            </button>
            
            {error && <p className="error">{error}</p>}
          </div>
          
          <div className="features">
            <h3>Features:</h3>
            <ul>
              <li>🗺️ Hex-basierte Weltkarte</li>
              <li>⚒️ Ressourcen sammeln & Gebäude bauen</li>
              <li>💼 Handelssystem mit anderen Spielern</li>
              <li>🔬 Forschungsbaum</li>
              <li>⚔️ Optionales Militär-System</li>
              <li>🌐 Echtzeit-Multiplayer</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }
  
  return <GameCanvas />;
}
