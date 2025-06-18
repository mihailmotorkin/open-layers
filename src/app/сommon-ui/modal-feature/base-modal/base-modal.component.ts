import { Component, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { SvgIconComponent } from '../../svg-icon/svg-icon.component';
import { ModalService } from '../services/modal.service';

@Component({
  selector: 'app-base-modal',
  imports: [
    SvgIconComponent
  ],
  templateUrl: './base-modal.component.html',
  styleUrl: './base-modal.component.css'
})
export class BaseModalComponent {
  #modalService = inject(ModalService);
  modalContent = viewChild('modalContent', { read: ElementRef });

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const modalContent = this.modalContent()?.nativeElement;

    if (modalContent && !modalContent.contains(target)) {
      this.closeModal(event);
    }
  }

  closeModal(event: MouseEvent) {
    event.stopPropagation();
    this.#modalService.destroyModal();
  }
}
