import { Component, input, output } from '@angular/core';
import { BaseModalComponent } from '../../сommon-ui/modal-feature/base-modal/base-modal.component';
import { GeometryType } from '../../interfaces/feature.interface';

@Component({
  selector: 'app-modal-interaction',
  imports: [
    BaseModalComponent
  ],
  templateUrl: './modal-interaction.component.html',
  styleUrl: './modal-interaction.component.css'
})
export class ModalInteractionComponent {
  type = input<GeometryType>();
  closed = output<'generate' | 'delete' | 'cancel'>();

  close(event: 'generate' | 'delete' | 'cancel') {
    this.closed.emit(event);
  }
}
