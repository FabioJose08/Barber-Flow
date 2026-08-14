document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // Mobile Hamburger Menu Navigation Toggle
  // ==========================================================================
  const menuToggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.querySelector('.sidebar-overlay');

  if (menuToggle && sidebar && sidebarOverlay) {
    const toggleMenu = () => {
      sidebar.classList.toggle('active');
      sidebarOverlay.classList.toggle('active');
    };

    menuToggle.addEventListener('click', toggleMenu);
    sidebarOverlay.addEventListener('click', toggleMenu);
  }

  // ==========================================================================
  // Service Type & Price Presets (For fast form filling)
  // ==========================================================================
  const serviceInput = document.getElementById('service_type');
  const priceInput = document.getElementById('price');
  const presetButtons = document.querySelectorAll('.preset-btn');

  if (presetButtons.length > 0 && serviceInput && priceInput) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active class from other buttons
        presetButtons.forEach(b => b.classList.remove('active'));
        
        // Add active to current
        btn.classList.add('active');

        // Fill inputs
        const value = btn.getAttribute('data-preset');
        const price = btn.getAttribute('data-price');
        serviceInput.value = value;
        if (price) {
          priceInput.value = parseFloat(price).toFixed(2);
        }
      });
    });

    // If service type input changes manually, match preset button if possible
    serviceInput.addEventListener('input', () => {
      const val = serviceInput.value.trim();
      presetButtons.forEach(btn => {
        if (btn.getAttribute('data-preset').toLowerCase() === val.toLowerCase()) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });
  }

  // ==========================================================================
  // Delete Appointment Confirmations
  // ==========================================================================
  const deleteForms = document.querySelectorAll('form.delete-confirm');
  deleteForms.forEach(form => {
    form.addEventListener('submit', (e) => {
      const clientName = form.getAttribute('data-client-name') || 'este cliente';
      const confirmAction = confirm(`Tem certeza que deseja excluir o agendamento de "${clientName}"?`);
      if (!confirmAction) {
        e.preventDefault();
      }
    });
  });

  // ==========================================================================
  // Date Helpers for Appointments Filters
  // ==========================================================================
  const filterDateInput = document.getElementById('custom_date_filter');
  if (filterDateInput) {
    filterDateInput.addEventListener('change', () => {
      // Find parent form and submit it automatically when a custom date is picked
      const form = filterDateInput.closest('form');
      if (form) {
        form.submit();
      }
    });
  }

  // Automatically submit filters when status dropdown changes
  const statusFilterSelect = document.getElementById('status_filter');
  const dateFilterSelect = document.getElementById('date_filter_select');

  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', () => {
      const form = statusFilterSelect.closest('form');
      if (form) form.submit();
    });
  }

  if (dateFilterSelect) {
    dateFilterSelect.addEventListener('change', () => {
      const form = dateFilterSelect.closest('form');
      
      // If choosing a custom date, display/hide custom date picker, otherwise submit form
      if (dateFilterSelect.value === 'custom') {
        if (filterDateInput) {
          filterDateInput.style.display = 'block';
          filterDateInput.focus();
        }
      } else {
        if (filterDateInput) filterDateInput.style.display = 'none';
        if (form) form.submit();
      }
    });
    
    // Initial display check for custom date input
    if (dateFilterSelect.value !== 'custom' && filterDateInput) {
      filterDateInput.style.display = 'none';
    } else if (filterDateInput) {
      filterDateInput.style.display = 'block';
    }
  }

  // ==========================================================================
  // Finalize/Conclude Appointment Modal Logic
  // ==========================================================================
  const finalizeModal = document.getElementById('finalizeModal');
  const finalizeForm = document.getElementById('finalizeForm');
  const modalCustomerName = document.getElementById('modalCustomerName');
  const modalServiceSelect = document.getElementById('modalServiceSelect');
  const modalServiceTypeInput = document.getElementById('modalServiceType');
  const modalPriceInput = document.getElementById('modalPrice');
  const modalNotesInput = document.getElementById('modalNotes');
  const closeFinalizeModalBtn = document.getElementById('closeFinalizeModal');
  const cancelFinalizeModalBtn = document.getElementById('cancelFinalizeModal');

  if (finalizeModal && finalizeForm) {
    const concludeButtons = document.querySelectorAll('.btn-conclude');

    concludeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const service = btn.getAttribute('data-service');
        const price = btn.getAttribute('data-price');
        
        finalizeForm.action = `/appointments/${id}/finalize`;
        modalCustomerName.textContent = name;
        
        modalServiceTypeInput.value = service;
        modalPriceInput.value = parseFloat(price).toFixed(2);
        modalNotesInput.value = '';
        
        // Try to match the select option
        let matched = false;
        if (modalServiceSelect) {
          for (let i = 0; i < modalServiceSelect.options.length; i++) {
            const opt = modalServiceSelect.options[i];
            if (opt.value.toLowerCase() === service.toLowerCase()) {
              modalServiceSelect.selectedIndex = i;
              matched = true;
              break;
            }
          }
          if (!matched) {
            modalServiceSelect.value = 'custom';
          }
        }
        
        toggleCustomServiceInput();
        finalizeModal.style.display = 'flex';
      });
    });

    const toggleCustomServiceInput = () => {
      if (!modalServiceSelect) return;
      
      if (modalServiceSelect.value === 'custom') {
        modalServiceTypeInput.style.display = 'block';
        modalServiceTypeInput.required = true;
      } else {
        modalServiceTypeInput.style.display = 'none';
        modalServiceTypeInput.required = false;
        
        // Update input value with the selected service and pre-fill its price
        const selectedOption = modalServiceSelect.options[modalServiceSelect.selectedIndex];
        modalServiceTypeInput.value = selectedOption.value;
        const priceAttr = selectedOption.getAttribute('data-price');
        if (priceAttr) {
          modalPriceInput.value = parseFloat(priceAttr).toFixed(2);
        }
      }
    };

    if (modalServiceSelect) {
      modalServiceSelect.addEventListener('change', toggleCustomServiceInput);
    }

    const closeModal = () => {
      finalizeModal.style.display = 'none';
    };

    if (closeFinalizeModalBtn) closeFinalizeModalBtn.addEventListener('click', closeModal);
    if (cancelFinalizeModalBtn) cancelFinalizeModalBtn.addEventListener('click', closeModal);
    finalizeModal.addEventListener('click', (e) => {
      if (e.target === finalizeModal) {
        closeModal();
      }
    });
  }

  // ==========================================================================
  // Clipboard Copy: Booking Online Link on Dashboard
  // ==========================================================================
  const copyBtn = document.getElementById('copyBookingUrlBtn');
  const urlInput = document.getElementById('bookingUrlInput');

  if (copyBtn && urlInput) {
    copyBtn.addEventListener('click', () => {
      urlInput.select();
      urlInput.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(urlInput.value)
        .then(() => {
          const originalText = copyBtn.querySelector('span').textContent;
          copyBtn.querySelector('span').textContent = 'Copiado!';
          copyBtn.style.backgroundColor = 'var(--color-finalizado)';
          copyBtn.style.borderColor = 'var(--color-finalizado)';
          copyBtn.style.color = 'var(--text-dark)';
          setTimeout(() => {
            copyBtn.querySelector('span').textContent = originalText;
            copyBtn.style.backgroundColor = '';
            copyBtn.style.borderColor = '';
            copyBtn.style.color = '';
          }, 2000);
        })
        .catch(err => {
          console.error('Could not copy link: ', err);
        });
    });
  }
});
