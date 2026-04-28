"""
Oracle Cloud ARM A1 instance launch via Python OCI SDK.
Called by oracle-retry.ps1. Exits 0 on success, 2 on capacity error, 1 on other errors.
Prints the instance OCID to stdout on success.
"""
import sys
import json
import oci

def main():
    if len(sys.argv) < 6:
        print("Usage: oracle-launch.py <compartment_id> <subnet_id> <image_id> <ad> <ssh_pubkey_path>", file=sys.stderr)
        sys.exit(1)

    compartment_id  = sys.argv[1]
    subnet_id       = sys.argv[2]
    image_id        = sys.argv[3]
    ad              = sys.argv[4]
    ssh_key_path    = sys.argv[5]

    try:
        with open(ssh_key_path, 'r') as f:
            ssh_pubkey = f.read().strip()
    except Exception as e:
        print(f"ERRO ao ler chave SSH '{ssh_key_path}': {e}", file=sys.stderr)
        sys.exit(1)

    try:
        config = oci.config.from_file()
    except Exception as e:
        print(f"ERRO config OCI: {e}", file=sys.stderr)
        sys.exit(1)

    compute = oci.core.ComputeClient(config)

    launch = oci.core.models.LaunchInstanceDetails(
        availability_domain=ad,
        compartment_id=compartment_id,
        display_name="clinicai-prod",
        shape="VM.Standard.A1.Flex",
        shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(
            ocpus=4,
            memory_in_gbs=24
        ),
        source_details=oci.core.models.InstanceSourceViaImageDetails(
            image_id=image_id,
            boot_volume_size_in_gbs=100
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
        if e.status in (500,) or "InternalError" in msg or "Out of capacity" in msg or "InsufficientServiceCapacity" in msg:
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
