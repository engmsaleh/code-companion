class CustomModelsManager {
  constructor() {
    this.customModels = this.loadCustomModels();
  }

  loadCustomModels() {
    return JSON.parse(localStorage.get('customModels') || '[]');
  }

  saveCustomModels() {
    localStorage.set('customModels', JSON.stringify(this.customModels));
    this.render();
    viewController.renderModelDropdowns();
  }

  addCustomModel(provider, name) {
    const trimmedName = name.trim();
    this.customModels.push({ provider, model: trimmedName, name: `${trimmedName} (Custom)` });
    this.saveCustomModels();
  }

  deleteCustomModel(index) {
    this.customModels.splice(index, 1);
    this.saveCustomModels();
  }

  getCustomModels() {
    return this.customModels;
  }

  render() {
    this.renderCustomModels('customModelsList');
    this.renderAddModelForm('customModelsForm');
  }

  renderCustomModels(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    this.customModels.forEach((model, index) => {
      const modelElement = document.createElement('div');
      modelElement.className = 'mb-2 d-flex align-items-center';
      modelElement.innerHTML = `
      <div class="d-flex justify-content-between align-items-center w-100">
        <span>${model.provider} - ${model.name}</span>
        <button class="btn btn-sm btn-link text-danger delete-btn" data-index="${index}">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;
      container.appendChild(modelElement);
    });

    container.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) {
        const index = e.target.closest('.delete-btn').dataset.index;
        this.deleteCustomModel(index);
      }
    });
  }

  renderAddModelForm(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
      <form id="addCustomModelForm" class="mb-3">
        <div class="row g-2 align-items-center">
          <div class="col-auto">
            <select id="modelProvider" class="form-select" required>
              <option value="">Select Provider</option>
              <option value="OpenAI">OpenAI</option>
              <option value="Anthropic">Anthropic</option>
              <option value="OpenRouter">OpenRouter</option>
            </select>
          </div>
          <div class="col">
            <input type="text" id="modelName" class="form-control" placeholder="Model Name" required>
          </div>
          <div class="col-auto">
            <button type="submit" class="btn btn-outline-primary">
              <i class="bi bi-plus"></i>
            </button>
          </div>
        </div>
      </form>
    `;

    document.getElementById('addCustomModelForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const provider = document.getElementById('modelProvider').value;
      const name = document.getElementById('modelName').value;
      this.addCustomModel(provider, name);
      e.target.reset();
    });
  }
}

module.exports = CustomModelsManager;
