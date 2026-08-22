export {};

declare global {
  interface USBEndpoint {
    readonly endpointNumber: number;
    readonly direction: "in" | "out";
    readonly type: "bulk" | "interrupt" | "isochronous";
  }

  interface USBAlternateInterface {
    readonly alternateSetting: number;
    readonly interfaceClass: number;
    readonly endpoints: USBEndpoint[];
  }

  interface USBInterface {
    readonly interfaceNumber: number;
    readonly alternates: USBAlternateInterface[];
  }

  interface USBConfiguration {
    readonly configurationValue: number;
    readonly interfaces: USBInterface[];
  }

  interface USBOutTransferResult {
    readonly bytesWritten: number;
    readonly status: "ok" | "stall" | "babble";
  }

  interface USBDevice {
    readonly productName?: string;
    readonly manufacturerName?: string;
    readonly vendorId: number;
    readonly productId: number;
    readonly opened: boolean;
    readonly configuration: USBConfiguration | null;
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  }

  interface USB {
    requestDevice(options?: { filters: any[] }): Promise<USBDevice>;
    getDevices(): Promise<USBDevice[]>;
  }

  interface Navigator {
    usb?: USB;
  }
}
