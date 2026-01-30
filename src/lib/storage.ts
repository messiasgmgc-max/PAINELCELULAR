
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  address?: string;
  birthDate?: string;
  loyaltyPoints: number;
  notes?: string;
  createdAt: string;
}

export interface Device {
  id: string;
  model: string;
  brand: string;
  imei?: string;
  serialNumber?: string;
  color?: string;
  storage?: string;
  condition: 'novo' | 'seminovo' | 'usado';
  costPrice: number;
  salePrice: number;
  profitMargin: number;
  stock: number;
  photos?: string[];
  createdAt: string;
}

export interface Part {
  id: string;
  code: string;
  name: string;
  description?: string;
  supplier?: string;
  costPrice: number;
  salePrice: number;
  profitMargin: number;
  stock: number;
  minStock: number;
  maxStock: number;
  location?: string;
  barcode?: string;
  createdAt: string;
}

export interface ServiceOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  deviceModel: string;
  imei?: string;
  defect: string;
  deviceCondition: string;
  services: string[];
  parts: { partId: string; quantity: number; price: number }[];
  technicianId?: string;
  priority: 'normal' | 'urgente' | 'express';
  status: 'aguardando_pecas' | 'em_andamento' | 'aguardando_aprovacao' | 'concluido' | 'aguardando_retirada' | 'entregue';
  costPrice: number;
  salePrice: number;
  profit: number;
  deadline?: string;
  photos?: string[];
  signature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  name: string;
  role: 'tecnico' | 'vendedor' | 'atendente' | 'gerente';
  commission: number;
  login: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'receita' | 'despesa';
  description: string;
  amount: number;
  category: string;
  paymentMethod: string;
  status: 'pendente' | 'pago' | 'vencido';
  dueDate: string;
  paidDate?: string;
  relatedId?: string;
  createdAt: string;
}

class LocalStorage {
  private getItem<T>(key: string): T[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  private setItem<T>(key: string, data: T[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
  }

  // Customers
  getCustomers(): Customer[] {
    return this.getItem<Customer>('customers');
  }

  saveCustomer(customer: Customer): void {
    const customers = this.getCustomers();
    const index = customers.findIndex(c => c.id === customer.id);
    if (index >= 0) {
      customers[index] = customer;
    } else {
      customers.push(customer);
    }
    this.setItem('customers', customers);
  }

  deleteCustomer(id: string): void {
    const customers = this.getCustomers().filter(c => c.id !== id);
    this.setItem('customers', customers);
  }

  // Devices
  getDevices(): Device[] {
    return this.getItem<Device>('devices');
  }

  saveDevice(device: Device): void {
    const devices = this.getDevices();
    const index = devices.findIndex(d => d.id === device.id);
    if (index >= 0) {
      devices[index] = device;
    } else {
      devices.push(device);
    }
    this.setItem('devices', devices);
  }

  deleteDevice(id: string): void {
    const devices = this.getDevices().filter(d => d.id !== id);
    this.setItem('devices', devices);
  }

  // Parts
  getParts(): Part[] {
    return this.getItem<Part>('parts');
  }

  savePart(part: Part): void {
    const parts = this.getParts();
    const index = parts.findIndex(p => p.id === part.id);
    if (index >= 0) {
      parts[index] = part;
    } else {
      parts.push(part);
    }
    this.setItem('parts', parts);
  }

  deletePart(id: string): void {
    const parts = this.getParts().filter(p => p.id !== id);
    this.setItem('parts', parts);
  }

  // Service Orders
  getServiceOrders(): ServiceOrder[] {
    return this.getItem<ServiceOrder>('serviceOrders');
  }

  saveServiceOrder(order: ServiceOrder): void {
    const orders = this.getServiceOrders();
    const index = orders.findIndex(o => o.id === order.id);
    if (index >= 0) {
      orders[index] = order;
    } else {
      orders.push(order);
    }
    this.setItem('serviceOrders', orders);
  }

  deleteServiceOrder(id: string): void {
    const orders = this.getServiceOrders().filter(o => o.id !== id);
    this.setItem('serviceOrders', orders);
  }

  // Employees
  getEmployees(): Employee[] {
    return this.getItem<Employee>('employees');
  }

  saveEmployee(employee: Employee): void {
    const employees = this.getEmployees();
    const index = employees.findIndex(e => e.id === employee.id);
    if (index >= 0) {
      employees[index] = employee;
    } else {
      employees.push(employee);
    }
    this.setItem('employees', employees);
  }

  deleteEmployee(id: string): void {
    const employees = this.getEmployees().filter(e => e.id !== id);
    this.setItem('employees', employees);
  }

  // Transactions
  getTransactions(): Transaction[] {
    return this.getItem<Transaction>('transactions');
  }

  saveTransaction(transaction: Transaction): void {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === transaction.id);
    if (index >= 0) {
      transactions[index] = transaction;
    } else {
      transactions.push(transaction);
    }
    this.setItem('transactions', transactions);
  }

  deleteTransaction(id: string): void {
    const transactions = this.getTransactions().filter(t => t.id !== id);
    this.setItem('transactions', transactions);
  }

  // Initialize with sample data
  initializeSampleData(): void {
    if (this.getCustomers().length === 0) {
      const sampleCustomers: Customer[] = [
        {
          id: '1',
          name: 'João Silva',
          phone: '(11) 98765-4321',
          email: 'joao@email.com',
          cpf: '123.456.789-00',
          loyaltyPoints: 150,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Maria Santos',
          phone: '(11) 97654-3210',
          email: 'maria@email.com',
          loyaltyPoints: 320,
          createdAt: new Date().toISOString(),
        },
      ];
      this.setItem('customers', sampleCustomers);
    }

    if (this.getDevices().length === 0) {
      const sampleDevices: Device[] = [
        {
          id: '1',
          model: 'iPhone 13',
          brand: 'Apple',
          imei: '123456789012345',
          color: 'Azul',
          storage: '128GB',
          condition: 'seminovo',
          costPrice: 2500,
          salePrice: 3200,
          profitMargin: 28,
          stock: 3,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          model: 'Galaxy S21',
          brand: 'Samsung',
          color: 'Preto',
          storage: '256GB',
          condition: 'seminovo',
          costPrice: 1800,
          salePrice: 2400,
          profitMargin: 33.33,
          stock: 2,
          createdAt: new Date().toISOString(),
        },
      ];
      this.setItem('devices', sampleDevices);
    }

    if (this.getParts().length === 0) {
      const sampleParts: Part[] = [
        {
          id: '1',
          code: 'TELA-IP13',
          name: 'Tela iPhone 13',
          description: 'Tela original OLED',
          supplier: 'TechParts',
          costPrice: 450,
          salePrice: 650,
          profitMargin: 44.44,
          stock: 5,
          minStock: 2,
          maxStock: 10,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          code: 'BAT-IP13',
          name: 'Bateria iPhone 13',
          description: 'Bateria original 3095mAh',
          supplier: 'TechParts',
          costPrice: 120,
          salePrice: 200,
          profitMargin: 66.67,
          stock: 8,
          minStock: 3,
          maxStock: 15,
          createdAt: new Date().toISOString(),
        },
      ];
      this.setItem('parts', sampleParts);
    }

    if (this.getServiceOrders().length === 0) {
      const sampleOrders: ServiceOrder[] = [
        {
          id: '1',
          orderNumber: 'OS-001',
          customerId: '1',
          deviceModel: 'iPhone 13',
          imei: '123456789012345',
          defect: 'Tela quebrada',
          deviceCondition: 'Aparelho em bom estado, apenas tela danificada',
          services: ['Troca de tela'],
          parts: [{ partId: '1', quantity: 1, price: 650 }],
          priority: 'normal',
          status: 'em_andamento',
          costPrice: 450,
          salePrice: 650,
          profit: 200,
          deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      this.setItem('serviceOrders', sampleOrders);
    }

    if (this.getEmployees().length === 0) {
      const sampleEmployees: Employee[] = [
        {
          id: '1',
          name: 'Carlos Técnico',
          role: 'tecnico',
          commission: 10,
          login: 'carlos',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Ana Vendedora',
          role: 'vendedor',
          commission: 5,
          login: 'ana',
          createdAt: new Date().toISOString(),
        },
      ];
      this.setItem('employees', sampleEmployees);
    }
  }
}

export const storage = new LocalStorage();
