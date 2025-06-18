import { AfterViewInit, Component, inject, viewChild, ViewContainerRef } from '@angular/core';
import { ModalService } from '../services/modal.service';

@Component({
  selector: 'app-host-modal',
  imports: [],
  templateUrl: './host-modal.component.html',
  styleUrl: './host-modal.component.css'
})
export class HostModalComponent implements AfterViewInit {
  #modalService = inject(ModalService);
  modalHostContainer = viewChild('modalHostContainer', { read: ViewContainerRef });

  ngAfterViewInit() {
    const modalHostContainer = this.modalHostContainer();

    if (!modalHostContainer) { return; }

    this.#modalService.registerComponent(modalHostContainer);
  }
}
