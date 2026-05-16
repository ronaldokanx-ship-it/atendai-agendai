"""
Oracle Cloud instance launch via Python OCI SDK.
Supports both x86 AMD (VM.Standard.E2.1.Micro) and ARM (VM.Standard.A1.Flex).
Called by oracle-retry.ps1. Exits 0 on success, 2 on capacity error, 1 on other errors.
Prints the instance OCID to stdout on success.
"""
import sys
import oci

X86_SHAPE = "VM.Standard.E2.1.Micro"
ARM_SHAPE  = "VM.Standard.A1.Flex"

def main():
    if len(sys.argv) < 6:
        print(
            "Usage: oracle-launch.py <compartment_id> <subnet_id> <image_id> <ad> <ssh_pubkey_path>"
            " [shape] [ocpus] [memory_gb] [boot_gb] [region]",
            file=sys.stderr
        )
        sys.exit(1)

    compartment_id = sys.argv[1]
    subnet_id      = sys.argv[2]
    image_id       = sys.argv[3]
    ad             = sys.argv[4]
    ssh_key_path   = sys.argv[5]
    shape          = sys.argv[6] if len(sys.argv) > 6 else X86_SHAPE
    ocpus          = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0
    memory_gb      = float(sys.argv[8]) if len(sys.argv) > 8 else 1.0
    boot_gb        = int(sys.argv[9])   if len(sys.argv) > 9 else 50
    region         = sys.argv[10]       if len(sys.argv) > 10 else None

    try:
        with open(ssh_key_path, 'r') as f:
            ssh_pubkey = f.read().strip()
    except Exception as e:
        print(f"ERRO ao ler chave SSH '{ssh_key_path}': {e}", file=sys.stderr)
        sys.exit(1)

    try:
        config = oci.config.from_file()
        if region:
            config['region'] = region
    except Exception as e:
        print(f"ERRO config OCI: {e}", file=sys.stderr)
        sys.exit(1)

    compute = oci.core.ComputeClient(config)

    # x86 E2.1.Micro tem OCPU/RAM fixos — não aceita shape_config
    is_flex = shape == ARM_SHAPE or shape.endswith(".Flex")

    launch = oci.core.models.LaunchInstanceDetails(
        availability_domain=ad,
        compartment_id=compartment_id,
        display_name=f"clinicai-prod-{shape.split('.')[-1].lower()}",
        shape=shape,
        shape_config=(
            oci.core.models.LaunchInstanceShapeConfigDetails(
                ocpus=ocpus,
                memory_in_gbs=memory_gb
            ) if is_flex else None
        ),
        source_details=oci.core.models.InstanceSourceViaImageDetails(
            image_id=image_id,
            boot_volume_size_in_gbs=boot_gb
        ),
        create_vnic_details=oci.core.models.CreateVnicDetails(
            subnet_id=subnet_id,
            assign_public_ip=True
        ),
        metadata={
            "ssh_authorized_keys": ssh_pubkey
        }
    )

    try:
        resp = compute.launch_instance(launch)
        print(resp.data.id)
        sys.exit(0)
    except oci.exceptions.ServiceError as e:
        msg = e.message or str(e)
        if e.status in (500,) or any(k in msg for k in ("InternalError", "Out of capacity", "InsufficientServiceCapacity")):
            print(f"CAPACITY: {msg}", file=sys.stderr)
            sys.exit(2)
        elif e.status == 400 and "LimitExceeded" in msg:
            print(f"LIMIT: {msg}", file=sys.stderr)
            sys.exit(3)
        else:
            print(f"ERROR {e.status}: {msg}", file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":

    main()
