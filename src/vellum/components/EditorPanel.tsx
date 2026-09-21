import { CollapsiblePanel } from './CollapsiblePanel';
import { LayerTree } from './LayerTree';
import { PropertiesPanel } from './PropertiesPanel';
import styles from './EditorPanel.module.css';

export function EditorPanel() {
  return (
    <div className={styles.editorPanels} data-vellum>
      <CollapsiblePanel title="Layers">
        <LayerTree />
      </CollapsiblePanel>
      <CollapsiblePanel title="Properties">
        <PropertiesPanel />
      </CollapsiblePanel>
    </div>
  );
}
