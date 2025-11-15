import { PlayerState } from '../types/room-state';
import { RESOURCE_DEFINITIONS, ResourceType } from '@hex-kingdom/shared';
import './ResourcesPanel.css';

interface ResourcesPanelProps {
  player: PlayerState | null;
}

export default function ResourcesPanel({ player }: ResourcesPanelProps) {
  if (!player) {
    return null;
  }

  return (
    <div className="resources-panel">
      <div className="resources-title">RESOURCES</div>
      <div className="resources-list">
        <div className="resource-item">
          <span className="resource-icon">{RESOURCE_DEFINITIONS[ResourceType.WOOD].icon}</span>
          <span className="resource-amount">{Math.floor(player.wood)}</span>
        </div>
        <div className="resource-item">
          <span className="resource-icon">{RESOURCE_DEFINITIONS[ResourceType.STONE].icon}</span>
          <span className="resource-amount">{Math.floor(player.stone)}</span>
        </div>
        <div className="resource-item">
          <span className="resource-icon">{RESOURCE_DEFINITIONS[ResourceType.IRON].icon}</span>
          <span className="resource-amount">{Math.floor(player.iron)}</span>
        </div>
        <div className="resource-item">
          <span className="resource-icon">{RESOURCE_DEFINITIONS[ResourceType.GOLD].icon}</span>
          <span className="resource-amount">{Math.floor(player.gold)}</span>
        </div>
        <div className="resource-item">
          <span className="resource-icon">{RESOURCE_DEFINITIONS[ResourceType.FOOD].icon}</span>
          <span className="resource-amount">{Math.floor(player.food)}</span>
        </div>
        <div className="resource-item">
          <span className="resource-icon">{RESOURCE_DEFINITIONS[ResourceType.FISH].icon}</span>
          <span className="resource-amount">{Math.floor(player.fish)}</span>
        </div>
      </div>
    </div>
  );
}
