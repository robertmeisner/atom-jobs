export type AtomEventHandler<T> = { (data?: T): void };

export interface IAtomEvent<T> {
    on(handler: AtomEventHandler<T>): () => void;
    off(handler: AtomEventHandler<T>): void;
    once(handler: AtomEventHandler<T>): () => void;
}

export class AtomSchedulerEvent<T> implements IAtomEvent<T> {
    private handlers: AtomEventHandler<T>[] = [];

    public on(handler: AtomEventHandler<T>): () => void {
        this.handlers.push(handler);
        return () => this.off(handler);
    }

    public off(handler: AtomEventHandler<T>): void {
        this.handlers = this.handlers.filter(h => h !== handler);
    }

    public once(handler: AtomEventHandler<T>): () => void {
        const onceHandler: AtomEventHandler<T> = (data?: T) => {
            this.off(onceHandler);
            handler(data);
        };
        return this.on(onceHandler);
    }

    public clear() {
        this.handlers = [];
    }

    public trigger(data?: T): void {
        this.handlers.slice(0).forEach((handler) => handler(data));
    }

    public expose(): IAtomEvent<T> {
        return this;
    }
}