// Classes para organização do código
class OccurrenceManager {
  constructor() {
    this.storageKey = 'occurrenceItems';
    this.items = this.loadFromStorage();
    this.offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    this.map = null;
    this.markers = [];
    this.cameras = [];
    this.currentStream = null;
    this.currentCameraIndex = 0;
    this.capturedImage = null;
    this.confirmCallback = null;
    this.initializeUI();
    this.initializeMap();
    this.initializeCamera();
    this.updateStats();
    this.renderGallery();
    this.setupEventListeners();
    this.checkOnlineStatus();
  }

  initializeUI() {
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
    }
    
    const noItemsEl = document.getElementById('noItems');
    if (this.items.length === 0) {
      noItemsEl.classList.remove('hidden');
    } else {
      noItemsEl.classList.add('hidden');
    }
  }

  initializeMap() {
    try {
      this.map = L.map('map').setView([-23.550520, -46.633308], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.map);
      
      // Adicionar marcadores para ocorrências existentes
      this.updateMapMarkers();
    } catch (error) {
      this.showNotification('Erro ao inicializar o mapa: ' + error.message, 'error');
    }
  }

  updateMapMarkers() {
    this.markers.forEach(marker => this.map.removeLayer(marker));
    this.markers = [];
    
    this.items.forEach(item => {
      if (item.latitude && item.longitude) {
        const markerColor = item.status === 'Resolvido' ? 'green' : 
                           (item.priority === 'urgente' ? 'red' : 'blue');
        
        const markerIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${markerColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });
        
        const marker = L.marker([item.latitude, item.longitude], { icon: markerIcon })
          .addTo(this.map)
          .bindPopup(`
            <div>
              <strong>${this.formatDate(item.id)}</strong>
              <p>${item.comment.substring(0, 50)}${item.comment.length > 50 ? '...' : ''}</p>
              <p>Status: ${item.status}</p>
              <p>Categoria: ${this.formatCategory(item.category)}</p>
              <p>Prioridade: ${this.formatPriority(item.priority)}</p>
              <button onclick="occurrenceManager.openDetailsModal('${item.id}')" 
                      style="background-color: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; margin-top: 8px; cursor: pointer;">
                Ver Detalhes
              </button>
            </div>
          `);
        
        this.markers.push(marker);
      }
    });
    
    if (this.markers.length > 0) {
      const group = new L.featureGroup(this.markers);
      this.map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
  }

  async initializeCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameras = devices.filter(device => device.kind === 'videoinput');
      
      if (this.cameras.length > 0) {
        await this.startCamera();
      } else {
        this.showNotification('Nenhuma câmera encontrada', 'warning');
      }
    } catch (error) {
      this.showNotification('Erro ao inicializar câmera: ' + error.message, 'error');
    }
  }

  async startCamera() {
    try {
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => track.stop());
      }
      
      const constraints = {
        video: {
          deviceId: this.cameras.length > 0 ? { exact: this.cameras[this.currentCameraIndex].deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = document.getElementById('video');
      video.srcObject = this.currentStream;
      
      const switchCameraBtn = document.getElementById('switchCameraBtn');
      switchCameraBtn.style.display = this.cameras.length > 1 ? 'block' : 'none';
    } catch (error) {
      this.showNotification('Erro ao acessar câmera: ' + error.message, 'error');
    }
  }

  async switchCamera() {
    if (this.cameras.length <= 1) return;
    
    this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameras.length;
    await this.startCamera();
  }

  captureImage() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    this.capturedImage = canvas.toDataURL('image/jpeg', 0.8);
    
    const previewImage = document.getElementById('previewImage');
    previewImage.src = this.capturedImage;
    
    document.getElementById('capturePreview').classList.remove('hidden');
    document.getElementById('capturePreview').classList.add('fade-in');
  }

  cancelCapture() {
    this.capturedImage = null;
    document.getElementById('capturePreview').classList.add('hidden');
  }

  saveOccurrence() {
    if (!this.capturedImage) {
      this.showNotification('Nenhuma imagem capturada', 'error');
      return;
    }
    
    const comment = document.getElementById('comment').value.trim();
    if (!comment) {
      this.showNotification('Por favor, adicione uma descrição', 'warning');
      return;
    }
    
    const category = document.getElementById('category').value;
    const priority = document.getElementById('priority').value;
    const id = Date.now();
    
    navigator.geolocation.getCurrentPosition(
      position => {
        const item = {
          id: id,
          image: this.capturedImage,
          comment: comment,
          status: 'Não resolvido',
          category: category,
          priority: priority,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date().toISOString()
        };
        
        this.addItem(item);
        this.cancelCapture();
        document.getElementById('comment').value = '';
        
        this.showNotification('Ocorrência registrada com sucesso!', 'success');
      },
      error => {
        const item = {
          id: id,
          image: this.capturedImage,
          comment: comment,
          status: 'Não resolvido',
          category: category,
          priority: priority,
          timestamp: new Date().toISOString()
        };
        
        this.addItem(item);
        this.cancelCapture();
        document.getElementById('comment').value = '';
        
        this.showNotification('Ocorrência registrada sem localização: ' + error.message, 'warning');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  addItem(item) {
    this.items.push(item);
    this.saveToStorage();
    this.renderGallery();
    this.updateStats();
    this.updateMapMarkers();
    
    document.getElementById('noItems').classList.add('hidden');
  }

  updateItemStatus(id, newStatus) {
    const item = this.items.find(i => i.id === parseInt(id));
    if (item) {
      item.status = newStatus;
      this.saveToStorage();
      this.updateStats();
      this.updateMapMarkers();
    }
  }


  deleteItem(id) {
    this.openConfirmModal(
      'Tem certeza que deseja excluir esta ocorrência?',
      () => {
        this.items = this.items.filter(item => item.id !== parseInt(id));
        this.saveToStorage();
        this.renderGallery();
        this.updateStats();
        this.updateMapMarkers();
        
        // Mostrar mensagem de "nenhum item" se necessário
        if (this.items.length === 0) {
          document.getElementById('noItems').classList.remove('hidden');
        }
        
        this.showNotification('Ocorrência excluída com sucesso', 'success');
      }
    );
  }


  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    } catch (error) {
      this.showNotification('Erro ao salvar dados: ' + error.message, 'error');
    }
  }


  loadFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch (error) {
      this.showNotification('Erro ao carregar dados: ' + error.message, 'error');
      return [];
    }
  }


  renderGallery(filters = {}) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';
    

    let filteredItems = [...this.items];
    
    if (filters.status && filters.status !== 'todos') {
      filteredItems = filteredItems.filter(item => item.status === filters.status);
    }
    
    if (filters.category && filters.category !== 'todos') {
      filteredItems = filteredItems.filter(item => item.category === filters.category);
    }
    
    if (filters.priority && filters.priority !== 'todos') {
      filteredItems = filteredItems.filter(item => item.priority === filters.priority);
    }
    
    if (filters.date) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(today);
      thisWeek.setDate(today.getDate() - today.getDay());
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      filteredItems = filteredItems.filter(item => {
        const itemDate = new Date(parseInt(item.id));
        
        if (filters.date === 'hoje') {
          return itemDate >= today;
        } else if (filters.date === 'semana') {
          return itemDate >= thisWeek;
        } else if (filters.date === 'mes') {
          return itemDate >= thisMonth;
        }
        return true;
      });
    }
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        item.comment.toLowerCase().includes(searchTerm) ||
        this.formatCategory(item.category).toLowerCase().includes(searchTerm) ||
        this.formatPriority(item.priority).toLowerCase().includes(searchTerm)
      );
    }
    

    filteredItems.sort((a, b) => b.id - a.id);
    

    document.getElementById('itemCount').textContent = `${filteredItems.length} ${filteredItems.length === 1 ? 'item' : 'itens'}`;
    

    filteredItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'bg-gray-50 rounded-lg shadow p-4 slide-in';
      div.setAttribute('data-id', item.id);
      
      const priorityClass = this.getPriorityClass(item.priority);
      const statusClass = item.status === 'Resolvido' ? 'bg-green-600' : 'bg-red-600';
      
      div.innerHTML = `
        <div class="flex flex-col md:flex-row gap-4">
          <div class="md:w-1/3">
            <img src="${item.image}" alt="Ocorrência" class="w-full h-auto rounded-lg">
          </div>
          <div class="md:w-2/3">
            <div class="flex justify-between items-start mb-2">
              <div>
                <span class="status-badge ${statusClass} text-white text-xs px-2 py-1 rounded cursor-pointer" data-id="${item.id}">
                  ${item.status}
                </span>
                <span class="status-badge ${priorityClass} text-white text-xs px-2 py-1 rounded ml-1">
                  ${this.formatPriority(item.priority)}
                </span>
                <span class="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded ml-1">
                  ${this.formatCategory(item.category)}
                </span>
              </div>
              <div class="flex space-x-1">
                <button class="text-blue-600 hover:text-blue-800 details-btn" data-id="${item.id}">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="text-red-600 hover:text-red-800 delete-btn" data-id="${item.id}">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
            
            <p class="text-gray-700 mb-2">${item.comment}</p>
            
            <div class="text-sm text-gray-500">
              <p><i class="fas fa-calendar-alt mr-1"></i> ${this.formatDate(item.id)}</p>
              ${item.latitude && item.longitude ? 
                `<p><i class="fas fa-map-marker-alt mr-1"></i> Lat: ${item.latitude.toFixed(6)}, Long: ${item.longitude.toFixed(6)}</p>` : 
                '<p><i class="fas fa-map-marker-alt mr-1"></i> Localização não disponível</p>'
              }
            </div>
          </div>
        </div>
      `;
      
      gallery.appendChild(div);
    });
    
    if (filteredItems.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'text-center py-8 text-gray-500';
      noResults.innerHTML = `
        <i class="fas fa-search text-4xl mb-2"></i>
        <p>Nenhuma ocorrência encontrada com os filtros selecionados</p>
      `;
      gallery.appendChild(noResults);
    }
    

    document.querySelectorAll('.status-badge').forEach(badge => {
      if (badge.classList.contains('bg-red-600') || badge.classList.contains('bg-green-600')) {
        badge.addEventListener('click', e => {
          const id = e.target.getAttribute('data-id');
          const currentStatus = e.target.textContent.trim();
          const newStatus = currentStatus === 'Resolvido' ? 'Não resolvido' : 'Resolvido';
          
          this.updateItemStatus(id, newStatus);
          
          e.target.textContent = newStatus;
          e.target.classList.toggle('bg-red-600');
          e.target.classList.toggle('bg-green-600');
        });
      }
    });
    
    document.querySelectorAll('.details-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.target.closest('.details-btn').getAttribute('data-id');
        this.openDetailsModal(id);
      });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.target.closest('.delete-btn').getAttribute('data-id');
        this.deleteItem(id);
      });
    });
  }

  updateStats() {
    const totalCount = this.items.length;
    const resolvedCount = this.items.filter(item => item.status === 'Resolvido').length;
    const pendingCount = totalCount - resolvedCount;
    const urgentCount = this.items.filter(item => item.priority === 'urgente').length;
    
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('resolvedCount').textContent = resolvedCount;
    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('urgentCount').textContent = urgentCount;
    

    const categories = {
      'infraestrutura': { count: 0, resolved: 0 },
      'seguranca': { count: 0, resolved: 0 },
      'meio_ambiente': { count: 0, resolved: 0 },
      'transito': { count: 0, resolved: 0 },
      'outros': { count: 0, resolved: 0 }
    };
    
    this.items.forEach(item => {
      if (categories[item.category]) {
        categories[item.category].count++;
        if (item.status === 'Resolvido') {
          categories[item.category].resolved++;
        }
      }
    });
    
    const categoryStats = document.getElementById('categoryStats');
    categoryStats.innerHTML = '';
    
    Object.keys(categories).forEach(category => {
      if (categories[category].count > 0) {
        const percent = Math.round((categories[category].resolved / categories[category].count) * 100) || 0;
        
        const div = document.createElement('div');
        div.innerHTML = `
          <div class="flex justify-between items-center mb-1">
            <span class="text-sm">${this.formatCategory(category)}</span>
            <span class="text-sm">${categories[category].resolved}/${categories[category].count} (${percent}%)</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div class="bg-blue-600 h-2 rounded-full" style="width: ${percent}%"></div>
          </div>
        `;
        
        categoryStats.appendChild(div);
      }
    });
  }


  openDetailsModal(id) {
    const item = this.items.find(i => i.id === parseInt(id));
    if (!item) return;
    
    const modal = document.getElementById('detailsModal');
    const modalContent = document.getElementById('modalContent');
    
    const priorityClass = this.getPriorityClass(item.priority);
    const statusClass = item.status === 'Resolvido' ? 'bg-green-600' : 'bg-red-600';
    
    modalContent.innerHTML = `
      <div class="space-y-4">
        <img src="${item.image}" alt="Ocorrência" class="w-full rounded-lg">
        
        <div class="flex flex-wrap gap-2">
          <span class="status-badge ${statusClass} text-white text-xs px-2 py-1 rounded cursor-pointer" data-id="${item.id}">
            ${item.status}
          </span>
          <span class="status-badge ${priorityClass} text-white text-xs px-2 py-1 rounded">
            ${this.formatPriority(item.priority)}
          </span>
          <span class="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded">
            ${this.formatCategory(item.category)}
          </span>
        </div>
        
        <div>
          <h3 class="font-medium text-gray-800">Descrição</h3>
          <p class="text-gray-700">${item.comment}</p>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <h3 class="font-medium text-gray-800">Data e Hora</h3>
            <p class="text-gray-700">${this.formatDate(item.id, true)}</p>
          </div>
          <div>
            <h3 class="font-medium text-gray-800">ID</h3>
            <p class="text-gray-700">${item.id}</p>
          </div>
        </div>
        
        ${item.latitude && item.longitude ? `
          <div>
            <h3 class="font-medium text-gray-800">Localização</h3>
            <p class="text-gray-700">Latitude: ${item.latitude.toFixed(6)}</p>
            <p class="text-gray-700">Longitude: ${item.longitude.toFixed(6)}</p>
            <div id="detailMap" class="h-48 w-full rounded-lg mt-2"></div>
          </div>
        ` : ''}
        
        <div class="flex justify-end space-x-2 mt-4">
          <button id="modalDeleteBtn" class="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-500 transition">
            <i class="fas fa-trash mr-1"></i> Excluir
          </button>
          <button id="modalCloseBtn" class="bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-500 transition">
            <i class="fas fa-times mr-1"></i> Fechar
          </button>
        </div>
      </div>
    `;
    
    modal.style.display = 'block';
    
    if (item.latitude && item.longitude) {
      setTimeout(() => {
        const detailMap = L.map('detailMap').setView([item.latitude, item.longitude], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(detailMap);
        
        L.marker([item.latitude, item.longitude]).addTo(detailMap);
      }, 300);
    }
    

    document.getElementById('modalCloseBtn').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    document.getElementById('modalDeleteBtn').addEventListener('click', () => {
      modal.style.display = 'none';
      this.deleteItem(id);
    });
    
    document.querySelector('#detailsModal .status-badge').addEventListener('click', e => {
      const currentStatus = e.target.textContent.trim();
      const newStatus = currentStatus === 'Resolvido' ? 'Não resolvido' : 'Resolvido';
      
      this.updateItemStatus(id, newStatus);
      

      e.target.textContent = newStatus;
      e.target.classList.toggle('bg-red-600');
      e.target.classList.toggle('bg-green-600');
      

      const galleryBadge = document.querySelector(`.status-badge[data-id="${id}"]`);
      if (galleryBadge) {
        galleryBadge.textContent = newStatus;
        galleryBadge.classList.toggle('bg-red-600');
        galleryBadge.classList.toggle('bg-green-600');
      }
    });
  }


  openConfirmModal(message, callback) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmMessage').textContent = message;
    this.confirmCallback = callback;
    
    modal.style.display = 'block';
  }


  exportJSON() {
    const dataStr = JSON.stringify(this.items, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `ocorrencias_${new Date().toISOString().slice(0, 10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }


  exportCSV() {

    let csv = 'ID,Data,Comentário,Status,Categoria,Prioridade,Latitude,Longitude\n';
    

    this.items.forEach(item => {
      const row = [
        item.id,
        this.formatDate(item.id),
        `"${item.comment.replace(/"/g, '""')}"`,
        item.status,
        this.formatCategory(item.category),
        this.formatPriority(item.priority),
        item.latitude || '',
        item.longitude || ''
      ];
      
      csv += row.join(',') + '\n';
    });
    
    const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csv);
    const exportFileDefaultName = `ocorrencias_${new Date().toISOString().slice(0, 10)}.csv`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }


  checkOnlineStatus() {
    const updateStatus = () => {
      if (navigator.onLine) {
        this.syncOfflineData();
      }
    };
    
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', () => {
      this.showNotification('Você está offline. Os dados serão sincronizados quando a conexão for restaurada.', 'warning');
    });
    

    updateStatus();
  }


  syncOfflineData() {
    if (this.offlineQueue.length > 0) {
      this.showNotification(`Sincronizando ${this.offlineQueue.length} itens...`, 'info');
      
      
      this.offlineQueue = [];
      localStorage.setItem('offlineQueue', JSON.stringify(this.offlineQueue));
      
      this.showNotification('Dados sincronizados com sucesso!', 'success');
    }
  }


  showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notificationMessage');
    

    notification.className = 'fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50';
    
    switch (type) {
      case 'success':
        notification.classList.add('bg-green-600', 'text-white');
        break;
      case 'error':
        notification.classList.add('bg-red-600', 'text-white');
        break;
      case 'warning':
        notification.classList.add('bg-yellow-600', 'text-white');
        break;
      default:
        notification.classList.add('bg-blue-600', 'text-white');
    }
    
    notificationMessage.textContent = message;
    notification.classList.remove('hidden');
    

    setTimeout(() => {
      notification.classList.add('hidden');
    }, 3000);
  }


  setupEventListeners() {

    document.getElementById('captureBtn').addEventListener('click', () => this.captureImage());
    

    document.getElementById('cancelCaptureBtn').addEventListener('click', () => this.cancelCapture());
    

    document.getElementById('saveCaptureBtn').addEventListener('click', () => this.saveOccurrence());
    

    document.getElementById('switchCameraBtn').addEventListener('click', () => this.switchCamera());
    

    document.getElementById('uploadBtn').addEventListener('click', () => {
      document.getElementById('imageUpload').click();
    });
    
    document.getElementById('imageUpload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.capturedImage = event.target.result;
          

          const previewImage = document.getElementById('previewImage');
          previewImage.src = this.capturedImage;
          
          document.getElementById('capturePreview').classList.remove('hidden');
          document.getElementById('capturePreview').classList.add('fade-in');
        };
        reader.readAsDataURL(file);
      }
    });
    

    document.getElementById('applyFilters').addEventListener('click', () => {
      const filters = {
        status: document.getElementById('statusFilter').value,
        category: document.getElementById('categoryFilter').value,
        priority: document.getElementById('priorityFilter').value,
        date: document.getElementById('dateFilter').value,
        search: document.getElementById('searchFilter').value
      };
      
      this.renderGallery(filters);
    });
    

    document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
    document.getElementById('exportCSV').addEventListener('click', () => this.exportCSV());
    

    document.getElementById('darkModeToggle').addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    });
    

    document.getElementById('syncButton').addEventListener('click', () => {
      this.syncOfflineData();
    });
    

    document.getElementById('confirmAction').addEventListener('click', () => {
      if (this.confirmCallback) {
        this.confirmCallback();
        this.confirmCallback = null;
      }
      document.getElementById('confirmModal').style.display = 'none';
    });
    
    document.getElementById('cancelAction').addEventListener('click', () => {
      document.getElementById('confirmModal').style.display = 'none';
    });
    

    document.querySelectorAll('.close').forEach(closeBtn => {
      closeBtn.addEventListener('click', () => {
        closeBtn.closest('.modal').style.display = 'none';
      });
    });
    

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
      }
    });
  }


  formatDate(timestamp, includeTime = false) {
    const date = new Date(parseInt(timestamp));
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    
    return date.toLocaleDateString('pt-BR', options);
  }

  formatCategory(category) {
    const categories = {
      'infraestrutura': 'Infraestrutura',
      'seguranca': 'Segurança',
      'meio_ambiente': 'Meio Ambiente',
      'transito': 'Trânsito',
      'outros': 'Outros'
    };
    
    return categories[category] || category;
  }

  formatPriority(priority) {
    const priorities = {
      'baixa': 'Baixa',
      'media': 'Média',
      'alta': 'Alta',
      'urgente': 'Urgente'
    };
    
    return priorities[priority] || priority;
  }

  getPriorityClass(priority) {
    const classes = {
      'baixa': 'bg-blue-600',
      'media': 'bg-yellow-600',
      'alta': 'bg-orange-600',
      'urgente': 'bg-red-600'
    };
    
    return classes[priority] || 'bg-gray-600';
  }
}


document.addEventListener('DOMContentLoaded', () => {
  window.occurrenceManager = new OccurrenceManager();
});